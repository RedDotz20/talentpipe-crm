import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { RefreshTokenRepository } from '../../../repositories/refresh-token.repository';
import { TenantRepository } from '../../../repositories/tenant.repository';
import { UserRepository } from '../../../repositories/user.repository';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NIL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export interface TokenSubject {
  id: string;
  tenantId: string | null | undefined;
  role: string;
}

interface TokenPayload {
  sub: string;
  role: string;
  tenantId?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private refreshTokenRepo: RefreshTokenRepository,
    private tenantRepo: TenantRepository,
    private userRepo: UserRepository,
  ) {}

  async issueTokens(subject: TokenSubject) {
    const tenantId = subject.tenantId ?? NIL_TENANT_ID;
    const payload: TokenPayload = {
      sub: subject.id,
      role: subject.role,
      tenantId: subject.tenantId ?? undefined,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TTL,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
      expiresIn: '7d',
    });

    const tokenHash: string = await (argon2.hash(
      refreshToken,
    ) as Promise<string>);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await this.refreshTokenRepo.deleteByUser(subject.id);
    await this.refreshTokenRepo.create({
      userId: subject.id,
      tenantId,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  async rotate(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);

    const stored = await this.refreshTokenRepo.findLatestByUser(payload.sub);
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (new Date() > new Date(stored.expiresAt)) {
      await this.refreshTokenRepo.deleteByUser(payload.sub);
      throw new UnauthorizedException('Refresh token expired');
    }

    const tokenMatches = await argon2.verify(stored.tokenHash, refreshToken);
    if (!tokenMatches) throw new UnauthorizedException('Invalid refresh token');

    if (payload.tenantId) {
      const tenant = await this.tenantRepo.findById(payload.tenantId);
      if (tenant?.status === 'suspended') {
        throw new UnauthorizedException('This company account is suspended');
      }

      const user = await this.userRepo.findById(
        payload.sub,
        `tenant_${payload.tenantId}`,
      );
      if (!user || user.status === 'suspended') {
        throw new UnauthorizedException('This account is suspended');
      }
    }

    return this.issueTokens({
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    });
  }

  async logout(userId: string) {
    await this.refreshTokenRepo.deleteByUser(userId);
  }

  private verifyRefreshToken(refreshToken: string): {
    sub: string;
    tenantId: string | null | undefined;
    role: string;
  } {
    try {
      return this.jwtService.verify<{
        sub: string;
        tenantId: string | null | undefined;
        role: string;
      }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
