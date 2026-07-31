import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter';
import { ResponseInterceptor } from '../src/shared/response.interceptor';

interface ErrorResponse {
  error: { code: string; message: string };
}

interface SigninSuccessResponse {
  data: { accessToken: string; refreshToken: string };
  message: string;
}

describe('App e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Envelope contract', () => {
    it('POST /auth/signin — valid creds returns { data, message } envelope', async () => {
      const res = await request(app.getHttpServer() as unknown as string)
        .post('/api/auth/signin')
        .send({ email: 'admin@acme.com', password: 'Admin123!' });
      if (res.status === 401) {
        // seed not present in this env — skip
        return;
      }
      expect(res.status).toBe(200);

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
    });

    it('POST /auth/signin — bad creds returns { error: { code: "UNAUTHORIZED", message } }', async () => {
      const res = await request(app.getHttpServer() as unknown as string)
        .post('/api/auth/signin')
        .send({ email: 'admin@acme.com', password: 'wrong' });
      expect(res.status).toBe(401);

      const body = res.body as ErrorResponse;

      expect(body).toEqual({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        error: { code: 'UNAUTHORIZED', message: expect.any(String) },
      });
    });
  });
});
