import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import Redis from 'ioredis';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';

interface ErrorResponse {
  error: { code: string; message: string };
}

interface SigninSuccessResponse {
  data: { accessToken: string; refreshToken: string };
  message: string;
}

interface JwtClaims {
  sub: string;
}

interface ApiEnvelope<T> {
  data: T;
  message: string;
}

let app: INestApplication | undefined;
let cleanupPool: Pool | undefined;
let cleanupRedis: Redis | undefined;
const createdCandidateIds: string[] = [];

const decodeClaims = (token: string): JwtClaims => {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('The test token did not contain a JWT payload');
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as JwtClaims;
};

const assertStatus = (
  response: { status: number; body: unknown },
  expected: number,
): void => {
  if (response.status !== expected) {
    throw new Error(
      `Expected HTTP ${expected}, received ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
};

const verifyInfrastructure = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl) {
    throw new Error('PostgreSQL unavailable: DATABASE_URL is not configured');
  }
  if (!redisUrl) {
    throw new Error('Redis unavailable: REDIS_URL is not configured');
  }

  cleanupPool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await cleanupPool.query('SELECT 1');
  } catch (error: unknown) {
    await cleanupPool.end();
    cleanupPool = undefined;
    throw new Error(
      `PostgreSQL unavailable via DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  cleanupRedis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  try {
    await cleanupRedis.connect();
    await cleanupRedis.ping();
  } catch (error: unknown) {
    cleanupRedis.disconnect();
    cleanupRedis = undefined;
    await cleanupPool.end();
    cleanupPool = undefined;
    throw new Error(
      `Redis unavailable via REDIS_URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

describe('App e2e', () => {
  beforeAll(async () => {
    await verifyInfrastructure();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const email = `task8-envelope-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`;
    const password = `Task8!${randomUUID().slice(0, 20)}`;
    const signup = await request(app.getHttpServer() as unknown as string)
      .post('/api/auth/signup')
      .send({ email, password, firstName: 'Envelope', lastName: 'Tester' });
    assertStatus(signup, 201);
    const signupBody = signup.body as ApiEnvelope<
      SigninSuccessResponse['data']
    >;
    createdCandidateIds.push(decodeClaims(signupBody.data.accessToken).sub);
  });

  afterAll(async () => {
    try {
      if (cleanupPool && createdCandidateIds.length > 0) {
        await cleanupPool.query(
          'DELETE FROM public.refresh_tokens WHERE user_id = ANY($1::uuid[])',
          [createdCandidateIds],
        );
        await cleanupPool.query(
          'DELETE FROM public.candidate_accounts WHERE id = ANY($1::uuid[])',
          [createdCandidateIds],
        );
      }
    } finally {
      if (app) await app.close();
      if (cleanupRedis) await cleanupRedis.quit();
      if (cleanupPool) await cleanupPool.end();
    }
  });

  describe('Envelope contract', () => {
    it('POST /auth/signin — valid credentials return { data, message } envelope', async () => {
      const email = `task8-valid-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`;
      const password = `Task8!${randomUUID().slice(0, 20)}`;
      const signup = await request(app!.getHttpServer() as unknown as string)
        .post('/api/auth/signup')
        .send({ email, password, firstName: 'Valid', lastName: 'Tester' });
      assertStatus(signup, 201);
      const signupBody = signup.body as ApiEnvelope<
        SigninSuccessResponse['data']
      >;
      const createdId = decodeClaims(signupBody.data.accessToken).sub;
      createdCandidateIds.push(createdId);

      const res = await request(app!.getHttpServer() as unknown as string)
        .post('/api/auth/signin')
        .send({ email, password });
      assertStatus(res, 200);

      const body = res.body as SigninSuccessResponse;
      expect(body).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            accessToken: expect.any(String),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            refreshToken: expect.any(String),
          }),
          message: 'Signed in',
        }),
      );

      if (cleanupPool) {
        await cleanupPool.query(
          'DELETE FROM public.refresh_tokens WHERE user_id = $1::uuid',
          [createdId],
        );
        await cleanupPool.query(
          'DELETE FROM public.candidate_accounts WHERE id = $1::uuid',
          [createdId],
        );
      }
    });

    it('POST /auth/signin — bad credentials return { error: { code: "UNAUTHORIZED", message } }', async () => {
      const res = await request(app!.getHttpServer() as unknown as string)
        .post('/api/auth/signin')
        .send({
          email: `task8-unknown-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`,
          password: `Task8!${randomUUID().slice(0, 20)}`,
        });
      assertStatus(res, 401);

      const body = res.body as ErrorResponse;
      expect(body).toEqual({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        error: { code: 'UNAUTHORIZED', message: expect.any(String) },
      });
    });
  });
});
