import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/tenant-context';
import { ResumesService } from './resumes.service';
import { ResumeRepository } from '../../repositories/resume.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { StorageService } from '../../common/storage/storage.service';
import { SkillMatchingService } from '../skill-matching/skill-matching.service';

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
    setResumeSkills: jest.fn(),
    findSkillsByResumeId: jest.fn(),
  };
  const candidateRepo = { findById: jest.fn() };
  const skillRepo = { findAll: jest.fn() };
  const applicationRepo = {
    findByCandidateId: jest.fn(),
    updateMatchScore: jest.fn(),
  };
  const jobPostingRepo = {
    getRequiredSkillIds: jest.fn(),
  };
  const storage = {
    upload: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };
  const skillMatching = { computeScore: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumesService,
        { provide: ResumeRepository, useValue: resumeRepo },
        { provide: CandidateRepository, useValue: candidateRepo },
        { provide: SkillRepository, useValue: skillRepo },
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: JobPostingRepository, useValue: jobPostingRepo },
        { provide: StorageService, useValue: storage },
        { provide: SkillMatchingService, useValue: skillMatching },
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

  it('get returns resume with extracted skills', async () => {
    resumeRepo.findByCandidateId.mockResolvedValue({ id: 'r1', fileUrl: 'k' });
    resumeRepo.findSkillsByResumeId.mockResolvedValue([
      { id: 's1', name: 'TypeScript' },
    ]);
    await expect(service.get('c1')).resolves.toEqual({
      id: 'r1',
      fileUrl: 'k',
      skills: [{ id: 's1', name: 'TypeScript' }],
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

  it('upload stores file, parses text, matches skills, and recomputes scores', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1' });
    resumeRepo.create.mockResolvedValue({ id: 'r1', fileUrl: 'k' });
    skillRepo.findAll.mockResolvedValue([
      { id: 's1', name: 'TypeScript' },
      { id: 's2', name: 'SQL' },
    ]);
    resumeRepo.findSkillsByResumeId.mockResolvedValue([]);
    applicationRepo.findByCandidateId.mockResolvedValue([
      { id: 'a1', jobPostingId: 'p1' },
    ]);
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['s1', 's3']);
    skillMatching.computeScore.mockReturnValue(0.5);
    jest
      .spyOn(service, 'extractText')
      .mockResolvedValue('Strong TypeScript experience');
    jest.spyOn(service, 'extractSkills').mockResolvedValue(['s1']);

    await runInContext(() => service.upload('c1', pdfFile()));

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^tenants\/t1\/resumes\/c1\//),
      Buffer.from('%PDF-1.4 fake'),
      'application/pdf',
    );
    expect(resumeRepo.setResumeSkills).toHaveBeenCalledWith('r1', ['s1']);
    expect(applicationRepo.updateMatchScore).toHaveBeenCalledWith('a1', 0.5);
  });

  it('extractText returns empty string for a corrupt pdf', async () => {
    await expect(
      service.extractText(pdfFile().buffer, 'application/pdf'),
    ).resolves.toBe('');
  });

  it('extractText returns empty string for a corrupt docx', async () => {
    const text = await service.extractText(
      Buffer.from('not a real docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(text).toBe('');
  });

  it('extractSkills returns ids of skills present in text', async () => {
    skillRepo.findAll.mockResolvedValue([
      { id: 's1', name: 'TypeScript' },
      { id: 's2', name: 'SQL' },
      { id: 's3', name: 'Go' },
    ]);
    await expect(
      service.extractSkills('Strong TypeScript and SQL experience'),
    ).resolves.toEqual(['s1', 's2']);
  });
});
