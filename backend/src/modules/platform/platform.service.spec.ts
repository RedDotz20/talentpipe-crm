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
  };
  const usageRepo = {
    countUsers: jest.fn().mockResolvedValue(2),
    countApplications: jest.fn().mockResolvedValue(5),
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
      });
      expect(usageRepo.countUsers).toHaveBeenCalledWith('company_t1');
      expect(usageRepo.countApplications).toHaveBeenCalledWith('company_t1');
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
