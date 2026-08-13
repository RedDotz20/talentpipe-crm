import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlatformAccountsService } from './platform-accounts.service';
import { CompanyRepository } from '../../repositories/company.repository';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { AuditService } from '../../common/audit/audit.service';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { PermissionRepository } from '../../repositories/permission.repository';

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
      remove: jest.fn(),
      dropSchema: jest.fn(),
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
      setAllStatus: jest.fn(),
      remove: jest.fn(),
    },
    userEmailRepo: {
      findByEmail: jest.fn(),
      create: jest.fn(),
      deleteByUserId: jest.fn(),
      deleteByCompany: jest.fn(),
    },
    refreshTokenRepo: { deleteByUser: jest.fn(), deleteByCompany: jest.fn() },
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
      findAllByCandidate: jest.fn().mockResolvedValue([]),
      deleteById: jest.fn(),
      cancelByCompany: jest.fn(),
    },
    applicationRepo: {
      findAll: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    pipelineStageRepo: {
      findAll: jest.fn().mockResolvedValue([]),
    },
    jobListingsIndexRepo: {
      deleteByCompany: jest.fn(),
    },
    permissionRepo: { findById: jest.fn() },
    auditService: { log: jest.fn() },
  };
}

let deps: ReturnType<typeof makeDeps>;

function makeService(
  overrides: Partial<Record<keyof typeof deps, unknown>> = {},
): PlatformAccountsService {
  const merged = { ...deps, ...overrides };
  return new PlatformAccountsService(
    merged.tenantRepo as CompanyRepository,
    merged.userRepo as UserRepository,
    merged.userEmailRepo as UserEmailRepository,
    merged.refreshTokenRepo as RefreshTokenRepository,
    merged.interviewRepo as InterviewRepository,
    merged.candidateAccountRepo as CandidateAccountRepository,
    merged.candidateRepo as CandidateRepository,
    merged.candidateIndexRepo as CandidateApplicationsIndexRepository,
    merged.applicationRepo as ApplicationRepository,
    merged.pipelineStageRepo as PipelineStageRepository,
    merged.jobListingsIndexRepo as JobListingsIndexRepository,
    merged.permissionRepo as PermissionRepository,
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
      await service.listCompanyUsers('tenant-a');
      expect(deps.userRepo.findAll).toHaveBeenCalledWith('company_tenant-a');
    });

    it('404s when the tenant is missing', async () => {
      deps.tenantRepo.findById.mockResolvedValue(null);
      const service = makeService();
      await expect(service.listCompanyUsers('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409s when creating a user whose email already exists', async () => {
      deps.userEmailRepo.findByEmail.mockResolvedValue({ id: 'e1' });
      const service = makeService();
      await expect(
        service.createCompanyUser('tenant-a', {
          email: 'dup@x.com',
          role: 'Recruiter',
          password: 'password1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('409s when a case-variant email clashes with a lowercase candidate account', async () => {
      deps.userEmailRepo.findByEmail.mockResolvedValue(null);
      deps.candidateAccountRepo.findByEmail.mockResolvedValue({ id: 'c1' });
      const service = makeService();
      await expect(
        service.createCompanyUser('tenant-a', {
          email: 'John@Acme.com',
          role: 'Recruiter',
          password: 'password1',
        }),
      ).rejects.toThrow(ConflictException);
      expect(deps.candidateAccountRepo.findByEmail).toHaveBeenCalledWith(
        'john@acme.com',
      );
    });

    it('creates a tenant user and its email bridge', async () => {
      const service = makeService();
      await service.createCompanyUser('tenant-a', {
        email: 'new@x.com',
        role: 'Recruiter',
        password: 'password1',
      });
      expect(deps.userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'Recruiter' }),
        'company_tenant-a',
      );
      expect(deps.userEmailRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'tenant-a' }),
      );
    });

    it('updates a tenant user role and logs safe metadata', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'r@acme.com',
        role: 'Recruiter',
      });
      const service = makeService();
      const result = await service.updateCompanyUser('tenant-a', 'u1', {
        role: 'Interviewer',
      });
      expect(deps.userRepo.updateRole).toHaveBeenCalledWith(
        'u1',
        'Interviewer',
        'company_tenant-a',
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
        service.setCompanyUserStatus('tenant-a', 'u1', 'suspended'),
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
      await service.setCompanyUserStatus('tenant-a', 'u1', 'suspended');
      expect(deps.userRepo.updateStatus).toHaveBeenCalledWith(
        'u1',
        'suspended',
        'company_tenant-a',
      );
      expect(deps.refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u1');
      expect(deps.auditService.log).toHaveBeenCalled();
    });

    it('removes a tenant user and cleans up bridges', async () => {
      const service = makeService();
      await service.removeCompanyUser('tenant-a', 'u1');
      expect(deps.interviewRepo.deleteByInterviewer).toHaveBeenCalledWith(
        'u1',
        'company_tenant-a',
      );
      expect(deps.userEmailRepo.deleteByUserId).toHaveBeenCalledWith('u1');
    });

    it('lists tenant pipeline stages through the explicit schema', async () => {
      const service = makeService();
      await service.listCompanyStages('tenant-a');
      expect(deps.pipelineStageRepo.findAll).toHaveBeenCalledWith(
        'company_tenant-a',
      );
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
      deps.candidateIndexRepo.findAllByCandidate.mockResolvedValue([
        { id: 'idx1', applicationId: 'app1', companyId: 'tenant-a' },
      ]);
      deps.tenantRepo.findAll.mockResolvedValue([{ id: 'tenant-a' }]);
      deps.candidateRepo.findByAccountId.mockResolvedValue({ id: 'tc1' });
      const service = makeService();
      await service.removeCandidate('c1');
      expect(deps.candidateIndexRepo.deleteById).toHaveBeenCalledWith('idx1');
      expect(deps.applicationRepo.delete).toHaveBeenCalledWith(
        'app1',
        'company_tenant-a',
      );
      expect(
        deps.candidateIndexRepo.deleteById.mock.invocationCallOrder[0],
      ).toBeLessThan(deps.applicationRepo.delete.mock.invocationCallOrder[0]);
      expect(deps.candidateRepo.delete).toHaveBeenCalledWith(
        'tc1',
        'company_tenant-a',
      );
      expect(deps.candidateAccountRepo.remove).toHaveBeenCalledWith('c1');
    });
  });

  describe('listAllUsers', () => {
    it('merges company users with company names and candidates', async () => {
      deps.tenantRepo.findAll.mockResolvedValue([
        { id: 'tenant-a', name: 'Acme' },
      ]);
      deps.userRepo.findAll.mockResolvedValue([
        {
          id: 'u1',
          email: 'a@acme.com',
          role: 'Recruiter',
          status: 'active',
          presetId: null,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      deps.candidateAccountRepo.findAll.mockResolvedValue([
        {
          id: 'c1',
          email: 'c@x.com',
          firstName: 'Jane',
          lastName: 'Doe',
          phone: null,
          resumeFileUrl: null,
          createdAt: new Date('2026-02-01'),
        },
      ]);
      const service = makeService();
      const result = await service.listAllUsers({ page: 1, pageSize: 10 });
      expect(result.data[0]).toEqual({
        type: 'company',
        id: 'u1',
        email: 'a@acme.com',
        role: 'Recruiter',
        status: 'active',
        presetId: null,
        companyId: 'tenant-a',
        companyName: 'Acme',
        firstName: null,
        lastName: null,
        createdAt: expect.any(Date) as Date,
      });
      expect(result.data[1]).toEqual({
        type: 'candidate',
        id: 'c1',
        email: 'c@x.com',
        role: 'Candidate',
        status: null,
        companyId: null,
        companyName: null,
        firstName: 'Jane',
        lastName: 'Doe',
        createdAt: expect.any(Date) as Date,
      });
      expect(deps.userRepo.findAll).toHaveBeenCalledWith('company_tenant-a');
    });
  });

  describe('setCompanyUserStatus', () => {
    it('cascades when the suspended user is the CompanyAdmin', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'active',
      });
      deps.userRepo.updateStatus.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'suspended',
      });
      const service = makeService();
      await service.setCompanyUserStatus('tenant-a', 'u1', 'suspended');
      expect(deps.userRepo.setAllStatus).toHaveBeenCalledWith(
        'suspended',
        'company_tenant-a',
      );
      expect(deps.refreshTokenRepo.deleteByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
    });

    it('does not cascade for non-admin roles', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'rec@x.com',
        role: 'Recruiter',
        status: 'active',
      });
      deps.userRepo.updateStatus.mockResolvedValue({
        id: 'u1',
        email: 'rec@x.com',
        role: 'Recruiter',
        status: 'suspended',
      });
      const service = makeService();
      await service.setCompanyUserStatus('tenant-a', 'u1', 'suspended');
      expect(deps.userRepo.setAllStatus).not.toHaveBeenCalled();
    });

    it('does not cascade on reactivation of a CompanyAdmin', async () => {
      deps.userRepo.findById.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'suspended',
      });
      deps.userRepo.updateStatus.mockResolvedValue({
        id: 'u1',
        email: 'admin@x.com',
        role: 'CompanyAdmin',
        status: 'active',
      });
      const service = makeService();
      await service.setCompanyUserStatus('tenant-a', 'u1', 'active');
      expect(deps.userRepo.setAllStatus).not.toHaveBeenCalled();
    });
  });

  describe('deleteCompany', () => {
    it('cancels index rows, cleans public rows, drops the schema, and audits', async () => {
      deps.tenantRepo.findById.mockResolvedValue({
        id: 'tenant-a',
        name: 'Acme',
        slug: 'acme',
      });
      const service = makeService();
      const result = await service.deleteCompany('tenant-a');
      expect(result).toEqual({ id: 'tenant-a' });
      expect(deps.candidateIndexRepo.cancelByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(deps.applicationRepo).toBeDefined();
      expect(deps.userEmailRepo.deleteByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(deps.refreshTokenRepo.deleteByCompany).toHaveBeenCalledWith(
        'tenant-a',
      );
      expect(deps.tenantRepo.dropSchema).toHaveBeenCalledWith('tenant-a');
      expect(deps.tenantRepo.remove).toHaveBeenCalledWith('tenant-a');
      expect(deps.auditService.log).toHaveBeenCalledWith(
        'company.delete',
        'tenant-a',
        { name: 'Acme', slug: 'acme' },
        'tenant-a',
      );
    });

    it('throws NotFoundException for an unknown company', async () => {
      deps.tenantRepo.findById.mockResolvedValue(null);
      const service = makeService();
      await expect(service.deleteCompany('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
