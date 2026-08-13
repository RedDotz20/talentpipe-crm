import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from '../../../repositories/refresh-token.repository';
import { CompanyRepository } from '../../../repositories/company.repository';
import { UserRepository } from '../../../repositories/user.repository';
import { PermissionRepository } from '../../../repositories/permission.repository';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-value'),
  verify: jest.fn().mockResolvedValue(true),
}));

describe('TokenService', () => {
  let service: TokenService;
  const jwtService = {
    sign: jest.fn().mockReturnValue('token'),
    verify: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue('refresh-secret') };
  const refreshTokenRepo = {
    deleteByUser: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ id: '1' }),
    findLatestByUser: jest.fn(),
  };
  const tenantRepo = { findById: jest.fn() };
  const userRepo = { findById: jest.fn() };
  const permissionRepo = { findEffectivePermissions: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepo },
        { provide: CompanyRepository, useValue: tenantRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: PermissionRepository, useValue: permissionRepo },
      ],
    }).compile();
    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issueTokens', () => {
    it('signs access + refresh, stores a hashed row, and returns both tokens', async () => {
      const result = await service.issueTokens({
        id: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });

      expect(result).toEqual({ accessToken: 'token', refreshToken: 'token' });
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(jwtService.sign).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sub: 'u1',
          companyId: 't1',
          role: 'CompanyAdmin',
        }),
        expect.objectContaining({ secret: 'refresh-secret' }),
      );
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          companyId: 't1',
          tokenHash: 'hashed-value',
          expiresAt: expect.any(Date) as Date,
        }),
      );
    });

    it('maps a null companyId to the nil uuid in the stored row', async () => {
      await service.issueTokens({
        id: 'u1',
        companyId: null,
        role: 'Candidate',
      });
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: '00000000-0000-0000-0000-000000000000',
        }),
      );
    });
  });

  describe('rotate', () => {
    it('throws UnauthorizedException when no stored record exists', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        companyId: null,
        role: 'Candidate',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue(null);
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException on an expired stored record', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1000),
        tokenHash: 'hashed-value',
      });
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
    });

    it('re-issues tokens for a valid stored record', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: 'hashed-value',
      });
      tenantRepo.findById.mockResolvedValue({ id: 't1', status: 'active' });
      userRepo.findById.mockResolvedValue({ id: 'u1', status: 'active' });
      const result = await service.rotate('refresh-token');
      expect(result).toEqual({ accessToken: 'token', refreshToken: 'token' });
    });

    it('rejects rotation for a suspended tenant', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: 'hashed-value',
      });
      tenantRepo.findById.mockResolvedValue({ id: 't1', status: 'suspended' });
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects rotation for a suspended user', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: 'hashed-value',
      });
      tenantRepo.findById.mockResolvedValue({ id: 't1', status: 'active' });
      userRepo.findById.mockResolvedValue({
        id: 'u1',
        status: 'suspended',
      });
      await expect(service.rotate('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenRepo.create).not.toHaveBeenCalled();
    });

    it('skips tenant and user checks for nil-tenant tokens', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        companyId: null,
        role: 'Candidate',
      });
      refreshTokenRepo.findLatestByUser.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        tokenHash: 'hashed-value',
      });
      await service.rotate('refresh-token');
      expect(tenantRepo.findById).not.toHaveBeenCalled();
      expect(userRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('deletes stored tokens for the user', async () => {
      await service.logout('u1');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('permissions claim', () => {
    it('resolves effective permissions for a company user into the payload', async () => {
      permissionRepo.findEffectivePermissions.mockResolvedValue(['jobs.view']);
      await service.issueTokens({
        id: 'u1',
        companyId: 'c1',
        role: 'Recruiter',
      });
      expect(permissionRepo.findEffectivePermissions).toHaveBeenCalledWith(
        'u1',
        'company_c1',
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'u1',
          role: 'Recruiter',
          permissions: ['jobs.view'],
        }),
        expect.anything(),
      );
    });

    it('uses an empty permissions array for SuperAdmin (no lookup)', async () => {
      await service.issueTokens({
        id: 'sa',
        companyId: undefined,
        role: 'SuperAdmin',
      });
      expect(permissionRepo.findEffectivePermissions).not.toHaveBeenCalled();
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'SuperAdmin', permissions: [] }),
        expect.anything(),
      );
    });
  });
});
