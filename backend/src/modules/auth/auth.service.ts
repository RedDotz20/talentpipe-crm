import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { hashPassword, verifyPassword } from '../../shared/password';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import {
  userEmails,
  refreshTokens,
  tenants,
  users,
  pipelineStages,
  superAdmins,
} from '../../database/schema';
import { CandidateSignupDto } from './dto/candidate-auth.dto';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private drizzleSchema: DrizzleSchemaService,
    private tenantRepo: TenantRepository,
    private userRepo: UserRepository,
    private candidateAccountRepo: CandidateAccountRepository,
  ) {}

  async orgSignup(dto: {
    companyName: string;
    slug: string;
    email: string;
    password: string;
  }) {
    const existing = await this.tenantRepo.findBySlug(dto.slug);
    if (existing.length > 0) throw new ConflictException('Slug already taken');

    const tenantId = randomUUID();
    const { db: pubDb, release: pubRelease } =
      await this.drizzleSchema.forPublic();
    try {
      await pubDb
        .insert(tenants)
        .values({ id: tenantId, name: dto.companyName, slug: dto.slug })
        .execute();
    } finally {
      pubRelease();
    }

    const { db: schemaDb, release: schemaRelease } =
      await this.drizzleSchema.forPublic();
    try {
      await schemaDb.execute(
        `CREATE SCHEMA IF NOT EXISTS "tenant_${tenantId}"`,
      );
      const tables = [
        'users',
        'job_postings',
        'candidates',
        'pipeline_stages',
        'applications',
        'resumes',
        'resume_skills',
        'job_required_skills',
        'interviews',
        'interview_feedbacks',
        'notes',
      ];
      for (const table of tables) {
        await schemaDb.execute(
          `CREATE TABLE IF NOT EXISTS "tenant_${tenantId}"."${table}" (LIKE template."${table}" INCLUDING ALL)`,
        );
      }
    } finally {
      schemaRelease();
    }

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();

    const { db, release } = await this.drizzleSchema.forSchema(
      `tenant_${tenantId}`,
    );
    try {
      await db
        .insert(users)
        .values({
          id: userId,
          email: dto.email,
          passwordHash,
          role: 'OrgAdmin',
        })
        .execute();
      const defaultStages = [
        'Applied',
        'Screening',
        'Interview',
        'Offer',
        'Hired',
        'Rejected',
      ];
      for (let i = 0; i < defaultStages.length; i++) {
        await db
          .insert(pipelineStages)
          .values({ name: defaultStages[i], order: i })
          .execute();
      }
    } finally {
      release();
    }

    const { db: pubDb2, release: pubRelease2 } =
      await this.drizzleSchema.forPublic();
    try {
      await pubDb2
        .insert(userEmails)
        .values({ email: dto.email, tenantId, userId })
        .execute();
    } finally {
      pubRelease2();
    }

    return this.generateTokens(userId, tenantId, 'OrgAdmin');
  }

  async signin(dto: { email: string; password: string }) {
    // First: try org user login
    const { db: pubDb, release } = await this.drizzleSchema.forPublic();
    let emailRecord: { tenantId: string; userId: string } | null = null;
    try {
      const records = await pubDb
        .select()
        .from(userEmails)
        .where(eq(userEmails.email, dto.email))
        .execute();
      if (records.length > 0) {
        emailRecord = records[0];
      }
    } finally {
      release();
    }

    if (emailRecord) {
      // Org user login flow
      const { db: tenantDb, release: tenantRelease } =
        await this.drizzleSchema.forSchema(`tenant_${emailRecord.tenantId}`);
      try {
        const userResult = await tenantDb
          .select()
          .from(users)
          .where(eq(users.email, dto.email))
          .execute();
        if (userResult.length === 0)
          throw new UnauthorizedException('Invalid credentials');
        const user = userResult[0];
        const valid = await verifyPassword(user.passwordHash, dto.password);
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        return this.generateTokens(user.id, emailRecord.tenantId, user.role);
      } finally {
        tenantRelease();
      }
    }

    // Fallback: try candidate login
    const account = await this.candidateAccountRepo.findByEmail(dto.email);
    if (!account) {
      // Try superadmin login
      const { db: pubDb3, release: pubRelease3 } =
        await this.drizzleSchema.forPublic();
      try {
        const adminResult = await pubDb3
          .select()
          .from(superAdmins)
          .where(eq(superAdmins.email, dto.email))
          .execute();
        if (adminResult.length === 0)
          throw new UnauthorizedException('Invalid credentials');
        const admin = adminResult[0];
        const valid = await verifyPassword(admin.passwordHash, dto.password);
        if (!valid) throw new UnauthorizedException('Invalid credentials');
        return this.generateSuperAdminTokens(admin.id);
      } finally {
        pubRelease3();
      }
    }

    const valid = await verifyPassword(account.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateCandidateTokens(account.id);
  }

  async candidateSignup(dto: CandidateSignupDto) {
    const existing = await this.candidateAccountRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already taken');

    const passwordHash = await hashPassword(dto.password);
    const account = await this.candidateAccountRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    return this.generateCandidateTokens(account.id);
  }

  private async generateCandidateTokens(candidateAccountId: string) {
    const accessToken = this.jwtService.sign(
      { sub: candidateAccountId, role: 'Candidate' },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: candidateAccountId, role: 'Candidate' },
      { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: '7d' },
    );

    return { accessToken, refreshToken };
  }

  private async generateSuperAdminTokens(superAdminId: string) {
    const accessToken = this.jwtService.sign(
      { sub: superAdminId, tenantId: null, role: 'SuperAdmin' },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: superAdminId, tenantId: null, role: 'SuperAdmin' },
      { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: '7d' },
    );

    const tokenHash = await argon2.hash(refreshToken);
    const nilTenantId = '00000000-0000-0000-0000-000000000000';

    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.userId, superAdminId))
        .execute();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db
        .insert(refreshTokens)
        .values({
          userId: superAdminId,
          tenantId: nilTenantId,
          tokenHash,
          expiresAt,
        })
        .execute();
    } finally {
      release();
    }

    return { accessToken, refreshToken };
  }

  async logout(userId: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.userId, userId))
        .execute();
    } finally {
      release();
    }
  }

  async refresh(dto: { refreshToken: string }) {
    let payload: { sub: string; tenantId: string | null; role: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET!,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const records = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, payload.sub))
        .execute();
      if (records.length === 0)
        throw new UnauthorizedException('Invalid refresh token');

      const stored = records[0];
      if (new Date() > new Date(stored.expiresAt)) {
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.userId, payload.sub))
          .execute();
        throw new UnauthorizedException('Refresh token expired');
      }

      const tokenMatches = await argon2.verify(
        stored.tokenHash,
        dto.refreshToken,
      );
      if (!tokenMatches)
        throw new UnauthorizedException('Invalid refresh token');

      const tenantId =
        payload.role === 'SuperAdmin'
          ? '00000000-0000-0000-0000-000000000000'
          : (payload.tenantId as string);

      return this.generateTokens(payload.sub, tenantId, payload.role);
    } finally {
      release();
    }
  }

  private async generateTokens(userId: string, tenantId: string, role: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, tenantId, role },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, tenantId, role },
      { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: '7d' },
    );

    const tokenHash = await argon2.hash(refreshToken);

    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.userId, userId))
        .execute();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db
        .insert(refreshTokens)
        .values({ userId, tenantId, tokenHash, expiresAt })
        .execute();
    } finally {
      release();
    }

    return { accessToken, refreshToken };
  }
}
