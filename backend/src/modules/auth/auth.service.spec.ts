import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '@/modules/auth/auth.service';
import { CompanyProvisioningService } from '@/modules/auth/services/company-provisioning.service';
import { TokenService } from '@/modules/auth/services/token.service';
import { UserEmailRepository } from '@/repositories/user-email.repository';
import { UserRepository } from '@/repositories/user.repository';
import { CandidateAccountRepository } from '@/repositories/candidate-account.repository';
import { SuperAdminRepository } from '@/repositories/super-admin.repository';
import { CompanyRepository } from '@/repositories/company.repository';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  const tenantProvisioning = { createTenant: jest.fn() };
  const tokenService = { issueTokens: jest.fn() };
  const userEmailRepo = { findByEmail: jest.fn() };
  const userRepo = { findByEmail: jest.fn(), findById: jest.fn() };
  const candidateAccountRepo = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  };
  const superAdminRepo = { findByEmail: jest.fn(), findById: jest.fn() };
  const tenantRepo = { findById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: CompanyProvisioningService, useValue: tenantProvisioning },
        { provide: TokenService, useValue: tokenService },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: CandidateAccountRepository, useValue: candidateAccountRepo },
        { provide: SuperAdminRepository, useValue: superAdminRepo },
        { provide: CompanyRepository, useValue: tenantRepo },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('companySignup', () => {
    it('provisions tenant and issues CompanyAdmin tokens', async () => {
      tenantProvisioning.createTenant.mockResolvedValue({
        companyId: 't1',
        userId: 'u1',
      });
      tokenService.issueTokens.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      });

      const result = await service.companySignup({
        companyName: 'Acme',
        slug: 'acme',
        email: 'admin@acme.com',
        password: 'password1',
      });

      expect(tokenService.issueTokens).toHaveBeenCalledWith({
        id: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
      });
      expect(result).toEqual({
        data: { accessToken: 'a', refreshToken: 'r' },
        message: 'Company created',
      });
    });
  });

  describe('signin', () => {
    it('signs in an org user found via the email index', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({
        companyId: 't1',
        userId: 'u1',
      });
      userRepo.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'admin@acme.com',
        passwordHash: 'hash',
        role: 'CompanyAdmin',
      });
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        status: 'active',
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
        'company_t1',
      );
      expect(tokenService.issueTokens).toHaveBeenCalledWith({
        id: 'u1',
        companyId: 't1',
        role: 'CompanyAdmin',
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

    it('throws ForbiddenException when the tenant is suspended', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({
        companyId: 't1',
        userId: 'u1',
      });
      userRepo.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'admin@acme.com',
        passwordHash: 'hash',
        role: 'CompanyAdmin',
      });
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        status: 'suspended',
      });

      await expect(
        service.signin({ email: 'admin@acme.com', password: 'password1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the user is suspended', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({
        companyId: 't1',
        userId: 'u1',
      });
      userRepo.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'admin@acme.com',
        passwordHash: 'hash',
        role: 'CompanyAdmin',
        status: 'suspended',
      });
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        status: 'active',
      });

      await expect(
        service.signin({ email: 'admin@acme.com', password: 'password1' }),
      ).rejects.toThrow(ForbiddenException);
      expect(tokenService.issueTokens).not.toHaveBeenCalled();
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

  describe('me', () => {
    it('returns a candidate profile composed from first/last name', async () => {
      candidateAccountRepo.findById.mockResolvedValue({
        id: 'c1',
        email: 'jane@test.com',
        firstName: 'Jane',
        lastName: 'Doe',
        avatarUrl: 'candidate-avatars/c1/x.png',
      });
      const result = await service.me({
        companyId: 'public',
        userId: 'c1',
        role: 'Candidate',
      });
      expect(result).toMatchObject({
        id: 'c1',
        role: 'Candidate',
        companyId: null,
        email: 'jane@test.com',
        name: 'Jane Doe',
        avatarUrl: 'candidate-avatars/c1/x.png',
      });
    });

    it('returns a company user profile with the users.name column', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'rec@acme.com',
        role: 'Recruiter',
        name: 'Ada Lovelace',
        avatarUrl: null,
      });
      const result = await service.me({
        companyId: 't1',
        userId: 'u1',
        role: 'Recruiter',
      });
      expect(result).toMatchObject({
        id: 'u1',
        role: 'Recruiter',
        companyId: 't1',
        email: 'rec@acme.com',
        name: 'Ada Lovelace',
        avatarUrl: null,
      });
    });

    it('returns a super admin profile', async () => {
      superAdminRepo.findById.mockResolvedValue({
        id: 's1',
        email: 'sa@talentpipe.com',
        name: 'Super Admin',
        avatarUrl: 'platform/avatars/s1/x.png',
      });
      const result = await service.me({
        companyId: 'public',
        userId: 's1',
        role: 'SuperAdmin',
      });
      expect(result).toMatchObject({
        id: 's1',
        role: 'SuperAdmin',
        companyId: null,
        email: 'sa@talentpipe.com',
        name: 'Super Admin',
        avatarUrl: 'platform/avatars/s1/x.png',
      });
    });
  });
});
