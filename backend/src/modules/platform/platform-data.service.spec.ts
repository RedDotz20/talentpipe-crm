import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
        countByJobPosting: jest.fn().mockResolvedValue(0),
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
      jobPostingRepo: {
        findAll: jest.fn().mockResolvedValue([]),
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        setRequiredSkills: jest.fn(),
        getRequiredSkillIds: jest.fn().mockResolvedValue([]),
      },
      jobListingsIndexRepo: {
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      skillRepo: {
        findByIds: jest.fn().mockResolvedValue([]),
      },
      auditService: { log: jest.fn() },
      cacheService: { invalidateCompanyDashboard: jest.fn() },
      ...overrides,
    };
    const service = new PlatformDataService(
      mocks.tenantRepo as never,
      mocks.applicationRepo as never,
      mocks.pipelineStageRepo as never,
      mocks.candidateIndexRepo as never,
      mocks.interviewRepo as never,
      mocks.jobPostingRepo as never,
      mocks.jobListingsIndexRepo as never,
      mocks.skillRepo as never,
      mocks.auditService as never,
      mocks.cacheService as never,
    );
    return { service, mocks };
  };

  const query = { page: 1, pageSize: 10 };

  describe('listApplications', () => {
    it('lists applications tagged with the company name', async () => {
      const { service, mocks } = makeService({
        applicationRepo: {
          findAll: jest
            .fn()
            .mockResolvedValue([{ id: 'app1', stageName: 'Screening' }]),
          findById: jest.fn(),
          updateStage: jest.fn(),
        },
      });
      const result = await service.listApplications({}, query);
      expect(result.data).toEqual([
        {
          id: 'app1',
          stageName: 'Screening',
          companyName: 'Acme',
          companyId: 'tenant-a',
        },
      ]);
      expect(mocks.applicationRepo.findAll).toHaveBeenCalledWith(
        undefined,
        'company_tenant-a',
      );
    });

    it('filters applications by tenant id', async () => {
      const { service, mocks } = makeService();
      await service.listApplications({ companyId: 'tenant-a' }, query);
      expect(mocks.applicationRepo.findAll).toHaveBeenCalledWith(
        undefined,
        'company_tenant-a',
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
        },
      });
      const result = await service.listApplications(
        { status: 'Screening' },
        query,
      );
      expect(result.data).toEqual([
        expect.objectContaining({ id: 'app1', stageName: 'Screening' }),
      ]);
      expect(result.data).toHaveLength(1);
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
        companyId: 'tenant-a',
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
        'company_tenant-a',
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
        companyId: 'tenant-a',
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
        'company_tenant-a',
        's2',
      );
    });
  });

  describe('listInterviews', () => {
    it('lists interviews tagged with the company name', async () => {
      const { service, mocks } = makeService({
        interviewRepo: {
          findAll: jest
            .fn()
            .mockResolvedValue([{ id: 'iv1', status: 'scheduled' }]),
          findById: jest.fn(),
          update: jest.fn(),
        },
      });
      const result = await service.listInterviews({}, query);
      expect(result.data).toEqual([
        {
          id: 'iv1',
          status: 'scheduled',
          companyName: 'Acme',
          companyId: 'tenant-a',
        },
      ]);
      expect(mocks.interviewRepo.findAll).toHaveBeenCalledWith(
        undefined,
        'company_tenant-a',
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
        'company_tenant-a',
      );
      expect(mocks.interviewRepo.findById).toHaveBeenNthCalledWith(
        2,
        'iv1',
        'company_tenant-b',
      );
      expect(mocks.interviewRepo.update).toHaveBeenCalledWith(
        'iv1',
        { status: 'cancelled' },
        'company_tenant-b',
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

  describe('jobs', () => {
    it('lists jobs tagged with the company name', async () => {
      const { service, mocks } = makeService();
      mocks.jobPostingRepo.findAll.mockResolvedValue([
        { id: 'job1', title: 'Engineer', status: 'open' },
      ]);
      const result = await service.listJobs({}, query);
      expect(result.data).toEqual([
        {
          id: 'job1',
          title: 'Engineer',
          status: 'open',
          companyName: 'Acme',
          companyId: 'tenant-a',
        },
      ]);
      expect(mocks.jobPostingRepo.findAll).toHaveBeenCalledWith(
        undefined,
        'company_tenant-a',
      );
    });

    it('creates a job in the target schema and syncs the listings index', async () => {
      const { service, mocks } = makeService();
      mocks.skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
      mocks.jobPostingRepo.create.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        description: null,
        employmentType: 'full-time',
        location: 'Makati City',
        workSetup: 'on-site',
        status: 'draft',
      });
      mocks.jobPostingRepo.findById.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'draft',
      });

      await service.createJob({
        companyId: 'tenant-a',
        title: 'Engineer',
        employmentType: 'full-time',
        location: 'Makati City',
        workSetup: 'on-site',
        requiredSkillIds: ['s1'],
      });

      expect(mocks.jobPostingRepo.create).toHaveBeenCalledWith(
        {
          title: 'Engineer',
          description: null,
          employmentType: 'full-time',
          location: 'Makati City',
          workSetup: 'on-site',
        },
        'company_tenant-a',
      );
      expect(mocks.jobPostingRepo.setRequiredSkills).toHaveBeenCalledWith(
        'job1',
        ['s1'],
        'company_tenant-a',
      );
      expect(mocks.jobListingsIndexRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'tenant-a',
          jobPostingId: 'job1',
          title: 'Engineer',
          employmentType: 'full-time',
          location: 'Makati City',
          workSetup: 'on-site',
          companyName: 'Acme',
        }),
      );
      expect(
        mocks.cacheService.invalidateCompanyDashboard,
      ).toHaveBeenCalledWith('tenant-a');
    });

    it('rejects creating a job with unknown skills', async () => {
      const { service, mocks } = makeService();
      mocks.skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
      await expect(
        service.createJob({
          companyId: 'tenant-a',
          title: 'Engineer',
          employmentType: 'contract',
          location: 'Cebu City',
          workSetup: 'work-from-home',
          requiredSkillIds: ['s1', 'ghost'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('publishes a draft job and syncs the listings index', async () => {
      const { service, mocks } = makeService();
      mocks.jobPostingRepo.findById.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'draft',
      });
      mocks.jobPostingRepo.update.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'open',
      });

      await service.publishJob('job1');

      expect(mocks.jobPostingRepo.update).toHaveBeenCalledWith(
        'job1',
        { status: 'open' },
        'company_tenant-a',
      );
      expect(mocks.jobListingsIndexRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ jobPostingId: 'job1', status: 'open' }),
      );
    });

    it('refuses to publish a job that is not a draft', async () => {
      const { service, mocks } = makeService();
      mocks.jobPostingRepo.findById.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'open',
      });
      await expect(service.publishJob('job1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('closes an open job and syncs the listings index', async () => {
      const { service, mocks } = makeService();
      mocks.jobPostingRepo.findById.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'open',
      });
      mocks.jobPostingRepo.update.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'closed',
      });

      await service.closeJob('job1');

      expect(mocks.jobListingsIndexRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ jobPostingId: 'job1', status: 'closed' }),
      );
    });

    it('deletes a closed job without applications', async () => {
      const { service, mocks } = makeService();
      mocks.jobPostingRepo.findById.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'closed',
      });
      mocks.applicationRepo.countByJobPosting.mockResolvedValue(0);

      await service.deleteJob('job1');

      expect(mocks.jobPostingRepo.delete).toHaveBeenCalledWith(
        'job1',
        'company_tenant-a',
      );
      expect(mocks.jobListingsIndexRepo.delete).toHaveBeenCalledWith(
        'tenant-a',
        'job1',
      );
    });

    it('refuses to delete an open job or one with applications', async () => {
      const { service, mocks } = makeService();
      mocks.jobPostingRepo.findById.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'open',
      });
      await expect(service.deleteJob('job1')).rejects.toThrow(
        ConflictException,
      );

      mocks.jobPostingRepo.findById.mockResolvedValue({
        id: 'job1',
        title: 'Engineer',
        status: 'closed',
      });
      mocks.applicationRepo.countByJobPosting.mockResolvedValue(1);
      await expect(service.deleteJob('job1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('404s when the job exists in no tenant', async () => {
      const { service, mocks } = makeService();
      mocks.jobPostingRepo.findById.mockResolvedValue(null);
      await expect(service.getJob('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
