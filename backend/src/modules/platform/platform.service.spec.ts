import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UsageRepository } from '../../repositories/usage.repository';
import { AuditService } from '../../common/audit/audit.service';

describe('PlatformService', () => {
  let service: PlatformService;
  const tenantRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const usageRepo = {
    countUsers: jest.fn().mockResolvedValue(2),
    countApplications: jest.fn().mockResolvedValue(5),
  };
  const auditService = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: TenantRepository, useValue: tenantRepo },
        { provide: UsageRepository, useValue: usageRepo },
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
      const result = await service.getTenant('t1');
      expect(result).toEqual({
        id: 't1',
        name: 'Acme',
        users: 2,
        applications: 5,
      });
      expect(usageRepo.countUsers).toHaveBeenCalledWith('tenant_t1');
      expect(usageRepo.countApplications).toHaveBeenCalledWith('tenant_t1');
    });

    it('throws NotFoundException for an unknown tenant', async () => {
      tenantRepo.findById.mockResolvedValue(null);
      await expect(service.getTenant('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setTenantStatus', () => {
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
      const result = await service.setTenantStatus('t1', 'suspended');
      expect(result.status).toBe('suspended');
      expect(auditService.log).toHaveBeenCalledWith(
        'tenant.suspend',
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
      await expect(service.setTenantStatus('t1', 'suspended')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException for an unknown tenant', async () => {
      tenantRepo.findById.mockResolvedValue(null);
      await expect(
        service.setTenantStatus('nope', 'suspended'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('sums users and applications across all tenant schemas', async () => {
      tenantRepo.findAll.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
      const result = await service.getStats();
      expect(result).toEqual({ tenants: 2, users: 4, applications: 10 });
    });
  });
});
