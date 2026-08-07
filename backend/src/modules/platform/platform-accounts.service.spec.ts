import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlatformAccountsService } from './platform-accounts.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { AuditService } from '../../common/audit/audit.service';

jest.mock('../../common/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));

function makeDeps() {
  return {
    tenantRepo: {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-a', status: 'active' }),
      findAll: jest.fn().mockResolvedValue([]),
    },
    userRepo: {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'u1' }),
      findById: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'u1@x.com',
        role: 'Recruiter',
        status: 'active',
      }),
      updateRole: jest.fn(),
      resetPassword: jest.fn(),
      updateStatus: jest.fn(),
      remove: jest.fn(),
    },
    userEmailRepo: {
      findByEmail: jest.fn(),
      create: jest.fn(),
      deleteByUserId: jest.fn(),
    },
    refreshTokenRepo: { deleteByUser: jest.fn() },
    interviewRepo: { deleteByInterviewer: jest.fn() },
    candidateAccountRepo: {
      findAll: jest.fn().mockResolvedValue([]),
      findByEmail: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      updateProfile: jest.fn(),
      remove: jest.fn(),
    },
    candidateRepo: {
      findByAccountId: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    },
    candidateIndexRepo: {
      findByCandidate: jest.fn().mockResolvedValue([]),
      deleteById: jest.fn(),
    },
    applicationRepo: {
      findAll: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    auditService: { log: jest.fn() },
  };
}

let deps: ReturnType<typeof makeDeps>;

function makeService(
  overrides: Partial<Record<keyof typeof deps, unknown>> = {},
): PlatformAccountsService {
  const merged = { ...deps, ...overrides };
  return new PlatformAccountsService(
    merged.tenantRepo as TenantRepository,
    merged.userRepo as UserRepository,
    merged.userEmailRepo as UserEmailRepository,
    merged.refreshTokenRepo as RefreshTokenRepository,
    merged.interviewRepo as InterviewRepository,
    merged.candidateAccountRepo as CandidateAccountRepository,
    merged.candidateRepo as CandidateRepository,
    merged.candidateIndexRepo as CandidateApplicationsIndexRepository,
    merged.applicationRepo as ApplicationRepository,
    merged.auditService as AuditService,
  );
}

describe('PlatformAccountsService', () => {
  beforeEach(() => {
    deps = makeDeps();
  });

  describe('tenant users', () => {
    it('lists tenant users through the explicit schema', async () => {
      const service = makeService();
      await service.listTenantUsers('tenant-a');
      expect(deps.userRepo.findAll).toHaveBeenCalledWith('tenant_tenant-a');
    });

    it('404s when the tenant is missing', async () => {
      deps.tenantRepo.findById.mockResolvedValue(null);
      const service = makeService();
      await expect(service.listTenantUsers('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409s when creating a user whose email already exists', async () => {
      deps.userEmailRepo.findByEmail.mockResolvedValue({ id: 'e1' });
      const service = makeService();
      await expect(
        service.createTenantUser('tenant-a', {
          email: 'dup@x.com',
          role: 'Recruiter',
          password: 'password1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a tenant user and its email bridge', async () => {
      const service = makeService();
      await service.createTenantUser('tenant-a', {
        email: 'new@x.com',
        role: 'Recruiter',
        password: 'password1',
      });
      expect(deps.userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'Recruiter' }),
        'tenant_tenant-a',
      );
      expect(deps.userEmailRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a' }),
      );
    });

    it('updates a tenant user role and logs safe metadata', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'r@acme.com',
        role: 'Recruiter',
      });
      const service = makeService();
      const result = await service.updateTenantUser('tenant-a', 'u1', {
        role: 'Interviewer',
      });
      expect(deps.userRepo.updateRole).toHaveBeenCalledWith(
        'u1',
        'Interviewer',
        'tenant_tenant-a',
      );
      expect(deps.refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
      expect(deps.auditService.log).toHaveBeenCalledWith(
        'platform.user.update',
        'u1',
        { email: 'r@acme.com', role: 'Interviewer' },
        'tenant-a',
      );
      expect(result).toEqual({
        id: 'u1',
        email: 'r@acme.com',
        role: 'Interviewer',
      });
    });

    it('rejects a second suspension state change with 409', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'u1@x.com',
        role: 'Recruiter',
        status: 'suspended',
      });
      const service = makeService();
      await expect(
        service.setTenantUserStatus('tenant-a', 'u1', 'suspended'),
      ).rejects.toThrow(ConflictException);
    });

    it('suspends a user and deletes their refresh tokens', async () => {
      deps.userRepo.updateStatus.mockResolvedValue({
        id: 'u1',
        email: 'u1@x.com',
        role: 'Recruiter',
        status: 'suspended',
      });
      const service = makeService();
      await service.setTenantUserStatus('tenant-a', 'u1', 'suspended');
      expect(deps.userRepo.updateStatus).toHaveBeenCalledWith(
        'u1',
        'suspended',
        'tenant_tenant-a',
      );
      expect(deps.refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
      expect(deps.auditService.log).toHaveBeenCalled();
    });

    it('removes a tenant user and cleans up bridges', async () => {
      const service = makeService();
      await service.removeTenantUser('tenant-a', 'u1');
      expect(deps.interviewRepo.deleteByInterviewer).toHaveBeenCalledWith(
        'u1',
        'tenant_tenant-a',
      );
      expect(deps.userEmailRepo.deleteByUserId).toHaveBeenCalledWith('u1');
    });
  });

  describe('candidates', () => {
    it('lists candidates from the public schema', async () => {
      const service = makeService();
      await service.listCandidates();
      expect(deps.candidateAccountRepo.findAll).toHaveBeenCalled();
    });

    it('409s when creating a candidate whose email belongs to an org user', async () => {
      deps.candidateAccountRepo.findByEmail.mockResolvedValue(null);
      deps.userEmailRepo.findByEmail.mockResolvedValue({ id: 'e1' });
      const service = makeService();
      await expect(
        service.createCandidate({
          email: 'c@x.com',
          password: 'password1',
          firstName: 'C',
          lastName: 'X',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns an updateCandidate projection without the password hash', async () => {
      deps.candidateAccountRepo.findById.mockResolvedValue({
        id: 'c1',
        email: 'c@x.com',
      });
      deps.candidateAccountRepo.updateProfile.mockResolvedValue({
        id: 'c1',
        email: 'c@x.com',
        passwordHash: 'secret-hash',
        firstName: 'C',
        lastName: 'X',
        phone: null,
        createdAt: new Date('2026-01-01'),
      });
      const service = makeService();
      const result = await service.updateCandidate('c1', { firstName: 'New' });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toEqual({
        id: 'c1',
        email: 'c@x.com',
        firstName: 'C',
        lastName: 'X',
        phone: null,
        createdAt: new Date('2026-01-01'),
      });
    });

    it('removes a candidate and cascades index rows first, then applications and tenant candidates', async () => {
      deps.candidateAccountRepo.findById.mockResolvedValue({
        id: 'c1',
        email: 'c@x.com',
      });
      deps.candidateIndexRepo.findByCandidate.mockResolvedValue([
        { id: 'idx1', applicationId: 'app1', tenantId: 'tenant-a' },
      ]);
      deps.tenantRepo.findAll.mockResolvedValue([{ id: 'tenant-a' }]);
      deps.candidateRepo.findByAccountId.mockResolvedValue({ id: 'tc1' });
      const service = makeService();
      await service.removeCandidate('c1');
      expect(deps.candidateIndexRepo.deleteById).toHaveBeenCalledWith('idx1');
      expect(deps.applicationRepo.delete).toHaveBeenCalledWith(
        'app1',
        'tenant_tenant-a',
      );
      expect(
        deps.candidateIndexRepo.deleteById.mock.invocationCallOrder[0],
      ).toBeLessThan(deps.applicationRepo.delete.mock.invocationCallOrder[0]);
      expect(deps.candidateRepo.delete).toHaveBeenCalledWith(
        'tc1',
        'tenant_tenant-a',
      );
      expect(deps.candidateAccountRepo.remove).toHaveBeenCalledWith('c1');
    });
  });
});
