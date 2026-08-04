import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { NoteRepository } from '../../repositories/note.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { CacheService } from '../../common/cache/cache.service';
import { asyncStorage } from '../../common/context/tenant-context';

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run({ tenantId: 't1', userId: 'u1', role: 'OrgAdmin' }, fn);

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  const applicationRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStage: jest.fn(),
  };
  const pipelineStageRepo = { findById: jest.fn() };
  const noteRepo = { findByApplicationId: jest.fn(), create: jest.fn() };
  const candidateApplicationsIndexRepo = { updateStatus: jest.fn() };
  const cacheService = { invalidateTenantDashboard: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: PipelineStageRepository, useValue: pipelineStageRepo },
        { provide: NoteRepository, useValue: noteRepo },
        {
          provide: CandidateApplicationsIndexRepository,
          useValue: candidateApplicationsIndexRepo,
        },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();
    service = module.get<ApplicationsService>(ApplicationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists applications with filters', async () => {
    applicationRepo.findAll.mockResolvedValue([{ id: 'a1' }]);
    await expect(
      service.list({ jobPostingId: 'j1', stageId: 's1' }),
    ).resolves.toEqual([{ id: 'a1' }]);
    expect(applicationRepo.findAll).toHaveBeenCalledWith({
      jobPostingId: 'j1',
      stageId: 's1',
    });
  });

  it('getOne throws NotFoundException when missing', async () => {
    applicationRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('getOne returns the application with notes', async () => {
    applicationRepo.findById.mockResolvedValue({
      id: 'a1',
      candidateName: 'Jane',
    });
    noteRepo.findByApplicationId.mockResolvedValue([
      { id: 'n1', content: 'x' },
    ]);
    await expect(service.getOne('a1')).resolves.toEqual({
      id: 'a1',
      candidateName: 'Jane',
      notes: [{ id: 'n1', content: 'x' }],
    });
  });

  it('updateStage throws when the application is missing', async () => {
    applicationRepo.findById.mockResolvedValue(null);
    await expect(
      service.updateStage('a1', { stageId: 's1' }, 'tenant-a'),
    ).rejects.toThrow(NotFoundException);
  });

  it('updateStage throws when the stage is missing', async () => {
    applicationRepo.findById.mockResolvedValue({ id: 'a1' });
    pipelineStageRepo.findById.mockResolvedValue(null);
    await expect(
      service.updateStage('a1', { stageId: 's1' }, 'tenant-a'),
    ).rejects.toThrow(NotFoundException);
  });

  it('updateStage updates the record and syncs the index status', async () => {
    applicationRepo.findById.mockResolvedValue({
      id: 'a1',
      candidateName: 'Jane',
    });
    pipelineStageRepo.findById.mockResolvedValue({
      id: 's2',
      name: 'Interview',
    });
    applicationRepo.updateStage.mockResolvedValue({ id: 'a1' });
    noteRepo.findByApplicationId.mockResolvedValue([]);

    await runInContext(() =>
      service.updateStage('a1', { stageId: 's2' }, 'tenant-a'),
    );

    expect(applicationRepo.updateStage).toHaveBeenCalledWith('a1', 's2');
    expect(candidateApplicationsIndexRepo.updateStatus).toHaveBeenCalledWith(
      'a1',
      'tenant-a',
      'Interview',
    );
    expect(cacheService.invalidateTenantDashboard).toHaveBeenCalledWith('t1');
  });

  it('updateStage rejects when the stage update writes no application', async () => {
    applicationRepo.findById.mockResolvedValue({
      id: 'a1',
      candidateName: 'Jane',
    });
    pipelineStageRepo.findById.mockResolvedValue({
      id: 's2',
      name: 'Interview',
    });
    applicationRepo.updateStage.mockResolvedValue(null);

    await expect(
      runInContext(() =>
        service.updateStage('a1', { stageId: 's2' }, 'tenant-a'),
      ),
    ).rejects.toThrow('Application not found');

    expect(candidateApplicationsIndexRepo.updateStatus).not.toHaveBeenCalled();
    expect(cacheService.invalidateTenantDashboard).not.toHaveBeenCalled();
  });

  it('addNote creates a note with the current user', async () => {
    applicationRepo.findById.mockResolvedValue({ id: 'a1' });
    noteRepo.create.mockResolvedValue({ id: 'n1' });
    await expect(
      service.addNote(
        { tenantId: 't1', userId: 'u1', role: 'OrgAdmin' },
        'a1',
        { content: 'Phone screen scheduled' },
      ),
    ).resolves.toEqual({ id: 'n1' });
    expect(noteRepo.create).toHaveBeenCalledWith({
      applicationId: 'a1',
      authorUserId: 'u1',
      content: 'Phone screen scheduled',
    });
  });

  it('listNotes delegates to the note repo', async () => {
    noteRepo.findByApplicationId.mockResolvedValue([{ id: 'n1' }]);
    await expect(service.listNotes('a1')).resolves.toEqual([{ id: 'n1' }]);
    expect(noteRepo.findByApplicationId).toHaveBeenCalledWith('a1');
  });
});
