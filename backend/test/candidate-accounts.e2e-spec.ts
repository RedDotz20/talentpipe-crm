import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Candidate Accounts (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Test 1: Candidate signup
  it('POST /api/auth/candidate/signup — creates account and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/candidate/signup')
      .send({ firstName: 'Jane', lastName: 'Doe', email: `jane${Date.now()}@test.com`, password: 'Secret123!' })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    const payload = JSON.parse(atob(res.body.accessToken.split('.')[1]));
    expect(payload.role).toBe('Candidate');
    expect(payload.tenantId).toBeUndefined();
  });

  // Test 2: Candidate login
  it('POST /api/auth/candidate/login — authenticates and returns tokens', async () => {
    const email = `login${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/api/auth/candidate/signup')
      .send({ firstName: 'John', lastName: 'Smith', email, password: 'Secret123!' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/auth/candidate/login')
      .send({ email, password: 'Secret123!' })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    const payload = JSON.parse(atob(res.body.accessToken.split('.')[1]));
    expect(payload.role).toBe('Candidate');
  });

  // Test 3: Candidate login with wrong password
  it('POST /api/auth/candidate/login — returns 401 for invalid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/candidate/login')
      .send({ email: 'nonexistent@test.com', password: 'wrong' })
      .expect(401);

    expect(res.body.error).toBeDefined();
  });

  // Test 4: GET /api/candidate/jobs — returns job listings (public: empty or array)
  it('GET /api/candidate/jobs — returns list of published jobs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/candidate/jobs')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 5: Candidate endpoints require auth
  it('GET /api/candidate/applications — returns 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/api/candidate/applications')
      .expect(401);
  });

  // Test 6: Candidate endpoints work with valid token
  it('GET /api/candidate/applications — returns array with valid token', async () => {
    const email = `app${Date.now()}@test.com`;
    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/candidate/signup')
      .send({ firstName: 'App', lastName: 'Test', email, password: 'Secret123!' })
      .expect(201);

    const token = signupRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/candidate/applications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // Test 7: GET /api/candidate/profile — returns profile with valid token
  it('GET /api/candidate/profile — returns profile', async () => {
    const email = `prof${Date.now()}@test.com`;
    const signupRes = await request(app.getHttpServer())
      .post('/api/auth/candidate/signup')
      .send({ firstName: 'Profile', lastName: 'Test', email, password: 'Secret123!' })
      .expect(201);

    const token = signupRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/candidate/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe(email);
    expect(res.body.firstName).toBe('Profile');
    expect(res.body.role).toBe('Candidate');
  });
});
