import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/company-context';
import { ResumesService } from './resumes.service';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { StorageService } from '../../common/storage/storage.service';

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run(
    { companyId: 'public', userId: 'acc-1', role: 'Candidate' },
    fn,
  );

const pdfFile = (): Express.Multer.File =>
  ({
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake'),
    originalname: 'resume.pdf',
  }) as Express.Multer.File;

describe('ResumesService', () => {
  let service: ResumesService;
  const candidateAccountRepo = {
    findById: jest.fn(),
    uploadResume: jest.fn(),
    removeResume: jest.fn(),
  };
  const storage = {
    upload: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumesService,
        { provide: CandidateAccountRepository, useValue: candidateAccountRepo },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = module.get<ResumesService>(ResumesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('get throws NotFoundException when no resume exists', async () => {
    candidateAccountRepo.findById.mockResolvedValue(null);
    await expect(service.get('acc-1')).rejects.toThrow(NotFoundException);
  });

  it('get returns resume', async () => {
    const uploadedAt = new Date();
    candidateAccountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      resumeFileUrl: 'candidate-resumes/acc-1/uuid.pdf',
      resumeUploadedAt: uploadedAt,
    });
    await expect(service.get('acc-1')).resolves.toEqual({
      fileUrl: 'candidate-resumes/acc-1/uuid.pdf',
      uploadedAt,
    });
  });

  it('getFile throws NotFoundException when no resume exists', async () => {
    candidateAccountRepo.findById.mockResolvedValue(null);
    await expect(service.getFile('acc-1')).rejects.toThrow(NotFoundException);
  });

  it('getFile throws NotFoundException when file missing in storage', async () => {
    candidateAccountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      resumeFileUrl: 'candidate-resumes/acc-1/uuid.pdf',
    });
    storage.get.mockResolvedValue(null);
    await expect(service.getFile('acc-1')).rejects.toThrow(NotFoundException);
  });

  it('getFile returns buffer and pdf content type', async () => {
    const bytes = Buffer.from('%PDF-1.4 fake');
    candidateAccountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      resumeFileUrl: 'candidate-resumes/acc-1/uuid.pdf',
    });
    storage.get.mockResolvedValue(bytes);
    await expect(service.getFile('acc-1')).resolves.toEqual({
      buffer: bytes,
      contentType: 'application/pdf',
      filename: 'resume.pdf',
    });
    expect(storage.get).toHaveBeenCalledWith(
      'candidate-resumes/acc-1/uuid.pdf',
    );
  });

  it('getFile returns docx content type for docx keys', async () => {
    candidateAccountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      resumeFileUrl: 'candidate-resumes/acc-1/uuid.docx',
    });
    storage.get.mockResolvedValue(Buffer.from('docx'));
    const file = await service.getFile('acc-1');
    expect(file.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(file.filename).toBe('resume.docx');
  });

  it('upload rejects unsupported file types', async () => {
    const txt = {
      mimetype: 'text/plain',
      buffer: Buffer.from('hi'),
    } as Express.Multer.File;
    await expect(
      runInContext(() => service.upload('acc-1', txt)),
    ).rejects.toThrow(BadRequestException);
  });

  it('upload throws NotFoundException when candidate is missing', async () => {
    candidateAccountRepo.findById.mockResolvedValue(null);
    await expect(
      runInContext(() => service.upload('acc-1', pdfFile())),
    ).rejects.toThrow(NotFoundException);
  });

  it('upload stores file and returns resume', async () => {
    candidateAccountRepo.findById
      .mockResolvedValueOnce({ id: 'acc-1' })
      .mockResolvedValueOnce({
        id: 'acc-1',
        resumeFileUrl: 'candidate-resumes/acc-1/uuid.pdf',
        resumeUploadedAt: new Date('2026-08-04T12:00:00Z'),
      });
    candidateAccountRepo.uploadResume.mockResolvedValue(null);
    storage.upload.mockResolvedValue(null);

    await runInContext(() => service.upload('acc-1', pdfFile()));

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^candidate-resumes\/acc-1\//),
      Buffer.from('%PDF-1.4 fake'),
      'application/pdf',
    );
    expect(candidateAccountRepo.uploadResume).toHaveBeenCalledWith(
      'acc-1',
      expect.stringMatching(/^candidate-resumes\/acc-1\//),
    );
  });

  it('upload deletes old resume before uploading new', async () => {
    candidateAccountRepo.findById
      .mockResolvedValueOnce({
        id: 'acc-1',
        resumeFileUrl: 'old-resume-url',
      })
      .mockResolvedValueOnce({
        id: 'acc-1',
        resumeFileUrl: 'candidate-resumes/acc-1/uuid.pdf',
        resumeUploadedAt: new Date('2026-08-04T12:00:00Z'),
      });
    candidateAccountRepo.uploadResume.mockResolvedValue(null);
    storage.upload.mockResolvedValue(null);
    storage.delete.mockResolvedValue(null);

    await runInContext(() => service.upload('acc-1', pdfFile()));

    expect(storage.delete).toHaveBeenCalledWith('old-resume-url');
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^candidate-resumes\/acc-1\//),
      Buffer.from('%PDF-1.4 fake'),
      'application/pdf',
    );
  });
});
