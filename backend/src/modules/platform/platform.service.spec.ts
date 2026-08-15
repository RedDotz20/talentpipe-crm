import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CompanyRepository } from '../../repositories/company.repository';
import { UsageRepository } from '../../repositories/usage.repository';
import { UserRepository } from '../../repositories/user.repository';
import { AuditService } from '../../common/audit/audit.service';

describe('PlatformService', () => {
  let service: PlatformService;
  const tenantRepo = {
    findAll: jest.fn(),
    findPaginated: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    findCompaniesOverTime: jest.fn(),
  };
  const usageRepo = {
    countUsers: jest.fn().mockResolvedValue(2),
    countApplications: jest.fn().mockResolvedValue(5),
    countJobsByStatus: jest.fn().mockResolvedValue([]),
    countApplicationsByStage: jest.fn().mockResolvedValue([
      { stageName: 'Applied', count: 3 },
      { stageName: 'Interviewing', count: 2 },
    ]),
  };
  const userRepo = { setAllStatus: jest.fn() };
  const auditService = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: CompanyRepository, useValue: tenantRepo },
        { provide: UsageRepository, useValue: usageRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get<PlatformService>(PlatformService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTenant', () => {
    it('returns the tenant with usage counts', async () => {
      tenantRepo.findById.mockResolvedValue({ id: 't1', name: 'Acme' });
      const result = await service.getCompany('t1');
      expect(result).toEqual({
        id: 't1',
        name: 'Acme',
        users: 2,
        applications: 5,
        applicationsByStage: [
          { stageName: 'Applied', count: 3 },
          { stageName: 'Interviewing', count: 2 },
        ],
      });
      expect(usageRepo.countUsers).toHaveBeenCalledWith('company_t1');
      expect(usageRepo.countApplications).toHaveBeenCalledWith('company_t1');
      expect(usageRepo.countApplicationsByStage).toHaveBeenCalledWith(
        'company_t1',
      );
    });

    it('throws NotFoundException for an unknown tenant', async () => {
      tenantRepo.findById.mockResolvedValue(null);
      await expect(service.getCompany('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setCompanyStatus', () => {
    it('suspends and audits with the target tenant id', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        name: 'Acme',
        slug: 'acme',
        status: 'active',
      });
      tenantRepo.updateStatus.mockResolvedValue({
        id: 't1',
        status: 'suspended',
      });
      const result = await service.setCompanyStatus('t1', 'suspended');
      expect(result.status).toBe('suspended');
      expect(auditService.log).toHaveBeenCalledWith(
        'company.suspend',
        't1',
        { name: 'Acme', slug: 'acme' },
        't1',
      );
    });

    it('conflicts when the tenant is already in the target state', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        status: 'suspended',
      });
      await expect(service.setCompanyStatus('t1', 'suspended')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException for an unknown tenant', async () => {
      tenantRepo.findById.mockResolvedValue(null);
      await expect(
        service.setCompanyStatus('nope', 'suspended'),
      ).rejects.toThrow(NotFoundException);
    });

    it('cascades suspension to every user in the schema', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        name: 'Acme',
        slug: 'acme',
        status: 'active',
      });
      tenantRepo.updateStatus.mockResolvedValue({
        id: 't1',
        status: 'suspended',
      });
      await service.setCompanyStatus('t1', 'suspended');
      expect(userRepo.setAllStatus).toHaveBeenCalledWith(
        'suspended',
        'company_t1',
      );
    });

    it('cascades reactivation to every user in the schema', async () => {
      tenantRepo.findById.mockResolvedValue({
        id: 't1',
        name: 'Acme',
        slug: 'acme',
        status: 'suspended',
      });
      tenantRepo.updateStatus.mockResolvedValue({
        id: 't1',
        status: 'active',
      });
      await service.setCompanyStatus('t1', 'active');
      expect(userRepo.setAllStatus).toHaveBeenCalledWith(
        'active',
        'company_t1',
      );
    });
  });

  describe('getStats', () => {
    it('sums users and applications across all tenant schemas', async () => {
      tenantRepo.findAll.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
      const result = await service.getStats();
      expect(result).toEqual({ companies: 2, users: 4, applications: 10 });
    });
  });

  describe('getDashboard', () => {
    const overTime = {
      day: [{ label: '2026-08-12', count: 1 }],
      week: [{ label: '2026-08-10', count: 1 }],
      month: [{ label: '2026-08', count: 1 }],
    };

    beforeEach(() => {
      tenantRepo.findAll.mockResolvedValue([
        { id: 't1', name: 'Acme', status: 'active' },
        { id: 't2', name: 'Globex', status: 'suspended' },
      ]);
      tenantRepo.findCompaniesOverTime.mockResolvedValue(overTime);
      usageRepo.countUsers.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
      usageRepo.countApplications
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(0);
      usageRepo.countJobsByStatus
        .mockResolvedValueOnce([
          { status: 'open', count: 3 },
          { status: 'draft', count: 1 },
        ])
        .mockResolvedValueOnce([{ status: 'closed', count: 2 }]);
    });

    it('aggregates tenants, filters empty application companies, and sorts desc', async () => {
      const result = await service.getDashboard();
      expect(result).toEqual({
        companies: 2,
        activeCompanies: 1,
        suspendedCompanies: 1,
        users: 6,
        applications: 10,
        jobs: 6,
        companiesOverTime: overTime,
        applicationsPerCompany: [{ companyName: 'Acme', count: 10 }],
        usersPerCompany: [
          { companyName: 'Acme', count: 4 },
          { companyName: 'Globex', count: 2 },
        ],
        jobsByStatusPerCompany: [
          { companyName: 'Acme', draft: 1, open: 3, closed: 0 },
          { companyName: 'Globex', draft: 0, open: 0, closed: 2 },
        ],
      });
    });

    it('caps per-company charts at ten rows', async () => {
      const many = Array.from({ length: 12 }, (_, index) => ({
        id: `t${index}`,
        name: `Tenant ${index}`,
        status: 'active',
      }));
      tenantRepo.findAll.mockResolvedValue(many);
      usageRepo.countUsers.mockResolvedValue(1);
      usageRepo.countApplications.mockResolvedValue(1);
      usageRepo.countJobsByStatus.mockResolvedValue([
        { status: 'open', count: 1 },
      ]);

      const result = await service.getDashboard();
      expect(result.usersPerCompany).toHaveLength(10);
      expect(result.jobsByStatusPerCompany).toHaveLength(10);
      expect(result.applicationsPerCompany).toHaveLength(10);
    });
  });

  describe('listCompanies', () => {
    it('delegates to the tenant repository with pagination', async () => {
      tenantRepo.findPaginated.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });
      const result = await service.listCompanies({
        page: 1,
        pageSize: 10,
        status: 'active',
      });
      expect(tenantRepo.findPaginated).toHaveBeenCalledWith({
        page: 1,
        pageSize: 10,
        status: 'active',
      });
      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
    });
  });
});
