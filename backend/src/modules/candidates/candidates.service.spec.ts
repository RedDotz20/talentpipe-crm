import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { CandidateRepository } from '../../repositories/candidate.repository';

describe('CandidatesService', () => {
  let service: CandidatesService;
  const candidateRepo = { findAll: jest.fn(), findById: jest.fn(), create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: CandidateRepository, useValue: candidateRepo },
      ],
    }).compile();
    service = module.get<CandidatesService>(CandidatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists candidates', async () => {
    candidateRepo.findAll.mockResolvedValue([{ id: 'c1' }]);
    await expect(service.list()).resolves.toEqual([{ id: 'c1' }]);
  });

  it('getOne throws NotFoundException when missing', async () => {
    candidateRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('getOne returns the candidate', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1', name: 'Jane' });
    await expect(service.getOne('c1')).resolves.toEqual({ id: 'c1', name: 'Jane' });
  });

  it('create delegates to the repository', async () => {
    candidateRepo.create.mockResolvedValue({ id: 'c1', name: 'Jane' });
    await expect(
      service.create({ name: 'Jane', email: 'jane@example.com' }),
    ).resolves.toEqual({ id: 'c1', name: 'Jane' });
    expect(candidateRepo.create).toHaveBeenCalledWith({
      name: 'Jane',
      email: 'jane@example.com',
      phone: undefined,
    });
  });
});
