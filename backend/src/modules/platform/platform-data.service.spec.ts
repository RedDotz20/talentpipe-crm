import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PlatformDataService } from './platform-data.service';

describe('PlatformDataService', () => {
  const makeService = (overrides: Record<string, unknown> = {}) => {
    const mocks = {
      tenantRepo: {
        findAll: jest
          .fn()
          .mockResolvedValue([{ id: 'tenant-a', name: 'Acme' }]),
        findById: jest.fn().mockResolvedValue({ id: 'tenant-a', name: 'Acme' }),
      },
      applicationRepo: {
        findAll: jest.fn().mockResolvedValue([]),
        findById: jest.fn(),
        updateStage: jest.fn(),
        delete: jest.fn(),
      },
      pipelineStageRepo: {
        findById: jest.fn(),
        findAll: jest.fn(),
      },
      candidateIndexRepo: {
        findByApplication: jest.fn(),
        updateStatus: jest.fn(),
      },
      interviewRepo: {
        findAll: jest.fn().mockResolvedValue([]),
        findById: jest.fn(),
        update: jest.fn(),
      },
      auditService: { log: jest.fn() },
      cacheService: { invalidateTenantDashboard: jest.fn() },
      ...overrides,
    };
    const service = new PlatformDataService(
      mocks.tenantRepo as never,
      mocks.applicationRepo as never,
      mocks.pipelineStageRepo as never,
      mocks.candidateIndexRepo as never,
      mocks.interviewRepo as never,
      mocks.auditService as never,
      mocks.cacheService as never,
    );
    return { service, mocks };
  };

  describe('listApplications', () => {
    it('lists applications tagged with the tenant name', async () => {
      const { service, mocks } = makeService({
        applicationRepo: {
          findAll: jest
            .fn()
            .mockResolvedValue([{ id: 'app1', stageName: 'Screening' }]),
          findById: jest.fn(),
          updateStage: jest.fn(),
          delete: jest.fn(),
        },
      });
      const result = await service.listApplications({});
      expect(result).toEqual([
        {
          id: 'app1',
          stageName: 'Screening',
          tenantName: 'Acme',
          tenantId: 'tenant-a',
        },
      ]);
      expect(mocks.applicationRepo.findAll).toHaveBeenCalledWith(
        undefined,
        'tenant_tenant-a',
      );
    });

    it('filters applications by tenant id', async () => {
      const { service, mocks } = makeService();
      await service.listApplications({ tenantId: 'tenant-a' });
      expect(mocks.applicationRepo.findAll).toHaveBeenCalledWith(
        undefined,
        'tenant_tenant-a',
      );
    });

    it('filters applications by status after the fetch', async () => {
      const { service } = makeService({
        applicationRepo: {
          findAll: jest.fn().mockResolvedValue([
            { id: 'app1', stageName: 'Screening' },
            { id: 'app2', stageName: 'Applied' },
          ]),
          findById: jest.fn(),
          updateStage: jest.fn(),
          delete: jest.fn(),
        },
      });
      const result = await service.listApplications({ status: 'Screening' });
      expect(result).toEqual([
        expect.objectContaining({ id: 'app1', stageName: 'Screening' }),
      ]);
      expect(result).toHaveLength(1);
    });
  });

  describe('moveApplicationStage', () => {
    it('404s when moving the stage of an unknown application', async () => {
      const { service, mocks } = makeService();
      mocks.candidateIndexRepo.findByApplication.mockResolvedValue(null);
      await expect(
        service.moveApplicationStage('app1', { stageId: 's2' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('moves an application stage and syncs the candidate index', async () => {
      const { service, mocks } = makeService();
      mocks.candidateIndexRepo.findByApplication.mockResolvedValue({
        id: 'idx1',
        tenantId: 'tenant-a',
      });
      mocks.applicationRepo.findById.mockResolvedValue({
        id: 'app1',
        jobPostingId: 'j1',
        currentStageId: 's1',
      });
      mocks.pipelineStageRepo.findById.mockResolvedValue({
        id: 's2',
        name: 'Interview',
      });
      mocks.applicationRepo.updateStage.mockResolvedValue({ id: 'app1' });
      mocks.candidateIndexRepo.updateStatus.mockResolvedValue({ id: 'idx1' });
      mocks.applicationRepo.findById.mockResolvedValue({
        id: 'app1',
        currentStageId: 's2',
      });

      await service.moveApplicationStage('app1', { stageId: 's2' });

      expect(mocks.applicationRepo.updateStage).toHaveBeenCalledWith(
        'app1',
        's2',
        'tenant_tenant-a',
      );
      expect(mocks.candidateIndexRepo.updateStatus).toHaveBeenCalledWith(
        'app1',
        'tenant-a',
        'Interview',
      );
      expect(mocks.auditService.log).toHaveBeenCalledWith(
        'platform.application.stage_move',
        'app1',
        expect.objectContaining({ toStage: 'Interview' }),
        'tenant-a',
      );
    });

    it('rolls back and 503s when the index sync fails', async () => {
      const { service, mocks } = makeService();
      mocks.candidateIndexRepo.findByApplication.mockResolvedValue({
        id: 'idx1',
        tenantId: 'tenant-a',
      });
      mocks.applicationRepo.findById.mockResolvedValue({
        id: 'app1',
        candidateAccountId: 'c1',
        currentStageId: 's1',
      });
      mocks.pipelineStageRepo.findById.mockResolvedValue({
        id: 's2',
        name: 'Interview',
      });
      mocks.applicationRepo.updateStage.mockResolvedValue({ id: 'app1' });
      mocks.candidateIndexRepo.updateStatus.mockResolvedValue(null);

      await expect(
        service.moveApplicationStage('app1', { stageId: 's2' }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mocks.applicationRepo.updateStage).toHaveBeenNthCalledWith(
        2,
        'app1',
        's1',
        'tenant_tenant-a',
        's2',
      );
    });
  });

  describe('listInterviews', () => {
    it('lists interviews tagged with the tenant name', async () => {
      const { service, mocks } = makeService({
        interviewRepo: {
          findAll: jest
            .fn()
            .mockResolvedValue([{ id: 'iv1', status: 'scheduled' }]),
          findById: jest.fn(),
          update: jest.fn(),
        },
      });
      const result = await service.listInterviews({});
      expect(result).toEqual([
        {
          id: 'iv1',
          status: 'scheduled',
          tenantName: 'Acme',
          tenantId: 'tenant-a',
        },
      ]);
      expect(mocks.interviewRepo.findAll).toHaveBeenCalledWith(
        undefined,
        'tenant_tenant-a',
      );
    });
  });

  describe('rescheduleInterview', () => {
    it('reschedules an interview in the tenant that owns it', async () => {
      const { service, mocks } = makeService();
      mocks.tenantRepo.findAll.mockResolvedValue([
        { id: 'tenant-a', name: 'Acme' },
        { id: 'tenant-b', name: 'Beta' },
      ]);
      mocks.interviewRepo.findById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'iv1', status: 'scheduled' });
      mocks.interviewRepo.update.mockResolvedValue({
        id: 'iv1',
        status: 'cancelled',
      });

      const result = await service.rescheduleInterview('iv1', {
        status: 'cancelled',
      });

      expect(result).toEqual({ id: 'iv1', status: 'cancelled' });
      expect(mocks.interviewRepo.findById).toHaveBeenNthCalledWith(
        1,
        'iv1',
        'tenant_tenant-a',
      );
      expect(mocks.interviewRepo.findById).toHaveBeenNthCalledWith(
        2,
        'iv1',
        'tenant_tenant-b',
      );
      expect(mocks.interviewRepo.update).toHaveBeenCalledWith(
        'iv1',
        { status: 'cancelled' },
        'tenant_tenant-b',
      );
      expect(mocks.auditService.log).toHaveBeenCalledWith(
        'platform.interview.update',
        'iv1',
        expect.objectContaining({ status: 'cancelled' }),
        'tenant-b',
      );
    });

    it('404s when an interview exists in no tenant', async () => {
      const { service, mocks } = makeService();
      mocks.interviewRepo.findById.mockResolvedValue(null);
      await expect(
        service.rescheduleInterview('nope', { status: 'cancelled' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
