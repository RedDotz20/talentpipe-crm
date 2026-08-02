import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PipelineStagesService } from './pipeline-stages.service';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';

describe('PipelineStagesService', () => {
  let service: PipelineStagesService;
  const pipelineStageRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    countApplicationsForStage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineStagesService,
        { provide: PipelineStageRepository, useValue: pipelineStageRepo },
      ],
    }).compile();
    service = module.get<PipelineStagesService>(PipelineStagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists stages in order', async () => {
    pipelineStageRepo.findAll.mockResolvedValue([{ id: 's1' }]);
    await expect(service.list()).resolves.toEqual([{ id: 's1' }]);
  });

  it('create appends the stage at the end', async () => {
    pipelineStageRepo.findAll.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    pipelineStageRepo.create.mockResolvedValue({
      id: 's3',
      name: 'New',
      order: 2,
    });
    await expect(service.create({ name: 'New' })).resolves.toEqual({
      id: 's3',
      name: 'New',
      order: 2,
    });
    expect(pipelineStageRepo.create).toHaveBeenCalledWith({
      name: 'New',
      order: 2,
    });
  });

  it('update throws NotFoundException when missing', async () => {
    pipelineStageRepo.findById.mockResolvedValue(null);
    await expect(service.update('nope', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update renames a stage', async () => {
    pipelineStageRepo.findById.mockResolvedValue({ id: 's1' });
    pipelineStageRepo.update.mockResolvedValue({ id: 's1', name: 'Screening' });
    await expect(service.update('s1', { name: 'Screening' })).resolves.toEqual({
      id: 's1',
      name: 'Screening',
    });
    expect(pipelineStageRepo.update).toHaveBeenCalledWith('s1', {
      name: 'Screening',
    });
  });

  it('remove throws when stage is referenced by applications', async () => {
    pipelineStageRepo.findById.mockResolvedValue({ id: 's1' });
    pipelineStageRepo.countApplicationsForStage.mockResolvedValue(true);
    await expect(service.remove('s1')).rejects.toThrow(ConflictException);
  });

  it('remove deletes an unreferenced stage', async () => {
    pipelineStageRepo.findById.mockResolvedValue({ id: 's1' });
    pipelineStageRepo.countApplicationsForStage.mockResolvedValue(false);
    await expect(service.remove('s1')).resolves.toEqual({ id: 's1' });
    expect(pipelineStageRepo.delete).toHaveBeenCalledWith('s1');
  });
});
