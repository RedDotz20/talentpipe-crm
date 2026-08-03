import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/tenant-context';
import { ResumesService } from './resumes.service';
import { ResumeRepository } from '../../repositories/resume.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { StorageService } from '../../common/storage/storage.service';

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run({ tenantId: 't1', userId: 'u1', role: 'OrgAdmin' }, fn);

const pdfFile = (): Express.Multer.File =>
  ({
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake'),
    originalname: 'resume.pdf',
  }) as Express.Multer.File;

describe('ResumesService', () => {
  let service: ResumesService;
  const resumeRepo = {
    findByCandidateId: jest.fn(),
    create: jest.fn(),
  };
  const candidateRepo = { findById: jest.fn() };
  const storage = {
    upload: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumesService,
        { provide: ResumeRepository, useValue: resumeRepo },
        { provide: CandidateRepository, useValue: candidateRepo },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = module.get<ResumesService>(ResumesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('get throws NotFoundException when no resume exists', async () => {
    resumeRepo.findByCandidateId.mockResolvedValue(null);
    await expect(service.get('c1')).rejects.toThrow(NotFoundException);
  });

  it('get returns resume', async () => {
    const uploadedAt = new Date();
    resumeRepo.findByCandidateId.mockResolvedValue({
      id: 'r1',
      candidateId: 'c1',
      fileUrl: 'k',
      uploadedAt,
    });
    await expect(service.get('c1')).resolves.toEqual({
      id: 'r1',
      candidateId: 'c1',
      fileUrl: 'k',
      uploadedAt,
    });
  });

  it('upload rejects unsupported file types', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1' });
    const txt = {
      mimetype: 'text/plain',
      buffer: Buffer.from('hi'),
    } as Express.Multer.File;
    await expect(runInContext(() => service.upload('c1', txt))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('upload throws NotFoundException when candidate is missing', async () => {
    candidateRepo.findById.mockResolvedValue(null);
    await expect(
      runInContext(() => service.upload('c1', pdfFile())),
    ).rejects.toThrow(NotFoundException);
  });

  it('upload stores file and returns resume', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1' });
    resumeRepo.create.mockResolvedValue({ id: 'r1', fileUrl: 'k' });
    resumeRepo.findByCandidateId.mockResolvedValue({
      id: 'r1',
      candidateId: 'c1',
      fileUrl: 'k',
      uploadedAt: new Date(),
    });

    await runInContext(() => service.upload('c1', pdfFile()));

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^tenants\/t1\/resumes\/c1\//),
      Buffer.from('%PDF-1.4 fake'),
      'application/pdf',
    );
  });
});
