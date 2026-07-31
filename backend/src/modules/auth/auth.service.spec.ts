import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TenantProvisioningService } from './services/tenant-provisioning.service';
import { TokenService } from './services/token.service';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SuperAdminRepository } from '../../repositories/super-admin.repository';

jest.mock('argon2', () => ({ hash: jest.fn(), verify: jest.fn().mockResolvedValue(true) }));

describe('AuthService', () => {
  let service: AuthService;
  const tenantProvisioning = { createTenant: jest.fn() };
  const tokenService = { issueTokens: jest.fn() };
  const userEmailRepo = { findByEmail: jest.fn() };
  const userRepo = { findByEmail: jest.fn() };
  const candidateAccountRepo = { findByEmail: jest.fn(), create: jest.fn() };
  const superAdminRepo = { findByEmail: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TenantProvisioningService, useValue: tenantProvisioning },
        { provide: TokenService, useValue: tokenService },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: CandidateAccountRepository, useValue: candidateAccountRepo },
        { provide: SuperAdminRepository, useValue: superAdminRepo },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('orgSignup', () => {
    it('provisions tenant and issues OrgAdmin tokens', async () => {
      tenantProvisioning.createTenant.mockResolvedValue({
        tenantId: 't1',
        userId: 'u1',
      });
      tokenService.issueTokens.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      });

      const result = await service.orgSignup({
        companyName: 'Acme',
        slug: 'acme',
        email: 'admin@acme.com',
        password: 'password1',
      });

      expect(tokenService.issueTokens).toHaveBeenCalledWith({
        id: 'u1',
        tenantId: 't1',
        role: 'OrgAdmin',
      });
      expect(result).toEqual({
        data: { accessToken: 'a', refreshToken: 'r' },
        message: 'Company created',
      });
    });
  });

  describe('signin', () => {
    it('signs in an org user found via the email index', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({ tenantId: 't1', userId: 'u1' });
      userRepo.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'admin@acme.com',
        passwordHash: 'hash',
        role: 'OrgAdmin',
      });
      tokenService.issueTokens.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      });

      const result = await service.signin({
        email: 'admin@acme.com',
        password: 'password1',
      });

      expect(userRepo.findByEmail).toHaveBeenCalledWith(
        'admin@acme.com',
        'tenant_t1',
      );
      expect(tokenService.issueTokens).toHaveBeenCalledWith({
        id: 'u1',
        tenantId: 't1',
        role: 'OrgAdmin',
      });
      expect(result).toEqual({
        data: { accessToken: 'a', refreshToken: 'r' },
        message: 'Signed in',
      });
    });

    it('throws UnauthorizedException for unknown emails', async () => {
      userEmailRepo.findByEmail.mockResolvedValue(null);
      candidateAccountRepo.findByEmail.mockResolvedValue(null);
      superAdminRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.signin({ email: 'ghost@nowhere.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('delegates to TokenService.rotate and wraps the result', async () => {
      const rotate = jest
        .fn()
        .mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
      (tokenService as { rotate?: jest.Mock }).rotate = rotate;

      const result = await service.refresh({ refreshToken: 'rt' });

      expect(rotate).toHaveBeenCalledWith('rt');
      expect(result).toEqual({
        data: { accessToken: 'a', refreshToken: 'r' },
        message: 'Signed in',
      });
    });
  });
});
