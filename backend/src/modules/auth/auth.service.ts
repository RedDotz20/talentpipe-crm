import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { hashPassword, verifyPassword } from '../../shared/password';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { userEmails, refreshTokens, tenants, users, pipelineStages } from '../../database/schema';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private drizzleSchema: DrizzleSchemaService,
    private tenantRepo: TenantRepository,
    private userRepo: UserRepository,
  ) {}

  async signup(dto: { companyName: string; slug: string; email: string; password: string }) {
    const existing = await this.tenantRepo.findBySlug(dto.slug);
    if (existing.length > 0) throw new ConflictException('Slug already taken');

    const tenantId = randomUUID();
    const { db: pubDb, release: pubRelease } = await this.drizzleSchema.forPublic();
    try {
      await pubDb.insert(tenants).values({ id: tenantId, name: dto.companyName, slug: dto.slug }).execute();
    } finally {
      pubRelease();
    }

    const { db: schemaDb, release: schemaRelease } = await this.drizzleSchema.forPublic();
    try {
      await schemaDb.execute(`CREATE SCHEMA IF NOT EXISTS "tenant_${tenantId}"`);
      const tables = ['users', 'job_postings', 'candidates', 'pipeline_stages', 'applications', 'resumes', 'resume_skills', 'job_required_skills', 'interviews', 'interview_feedbacks', 'notes'];
      for (const table of tables) {
        await schemaDb.execute(`CREATE TABLE IF NOT EXISTS "tenant_${tenantId}"."${table}" (LIKE template."${table}" INCLUDING ALL)`);
      }
    } finally {
      schemaRelease();
    }

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();

    const { db, release } = await this.drizzleSchema.forSchema(`tenant_${tenantId}`);
    try {
      await db.insert(users).values({ id: userId, email: dto.email, passwordHash, role: 'OrgAdmin' }).execute();
      const defaultStages = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
      for (let i = 0; i < defaultStages.length; i++) {
        await db.insert(pipelineStages).values({ name: defaultStages[i], order: i }).execute();
      }
    } finally {
      release();
    }

    const { db: pubDb2, release: pubRelease2 } = await this.drizzleSchema.forPublic();
    try {
      await pubDb2.insert(userEmails).values({ email: dto.email, tenantId, userId }).execute();
    } finally {
      pubRelease2();
    }

    return this.generateTokens(userId, tenantId, 'OrgAdmin');
  }

  async login(dto: { email: string; password: string }) {
    const { db: pubDb, release } = await this.drizzleSchema.forPublic();
    let emailRecord: { tenantId: string; userId: string };
    try {
      const records = await pubDb.select().from(userEmails).where(eq(userEmails.email, dto.email)).execute();
      if (records.length === 0) throw new UnauthorizedException('Invalid credentials');
      emailRecord = records[0];
    } finally {
      release();
    }

    const userResult = await this.userRepo.findByEmail(dto.email);
    if (userResult.length === 0) throw new UnauthorizedException('Invalid credentials');
    const user = userResult[0];
    const valid = await verifyPassword(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user.id, emailRecord.tenantId, user.role);
  }

  async refresh(dto: { refreshToken: string }) {
    let payload: { sub: string; tenantId: string; role: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, { secret: process.env.JWT_REFRESH_SECRET! });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const records = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, payload.sub)).execute();
      if (records.length === 0) throw new UnauthorizedException('Invalid refresh token');

      const stored = records[0];
      if (new Date() > new Date(stored.expiresAt)) {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, payload.sub)).execute();
        throw new UnauthorizedException('Refresh token expired');
      }

      const tokenMatches = await argon2.verify(stored.tokenHash, dto.refreshToken);
      if (!tokenMatches) throw new UnauthorizedException('Invalid refresh token');

      return this.generateTokens(payload.sub, payload.tenantId, payload.role);
    } finally {
      release();
    }
  }

  private async generateTokens(userId: string, tenantId: string, role: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, tenantId, role },
      { expiresIn: '15m' },
    );

    const rawRefresh = randomUUID();
    const refreshToken = this.jwtService.sign(
      { sub: userId, tenantId, role },
      { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: '7d' },
    );

    const tokenHash = await argon2.hash(rawRefresh);

    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId)).execute();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(refreshTokens).values({ userId, tenantId, tokenHash, expiresAt }).execute();
    } finally {
      release();
    }

    return { accessToken, refreshToken };
  }
}
