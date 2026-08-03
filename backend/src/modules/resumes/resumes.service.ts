import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getTenantId } from '../../common/context/tenant-context';
import { ResumeRepository } from '../../repositories/resume.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { StorageService } from '../../common/storage/storage.service';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class ResumesService {
  constructor(
    private readonly resumeRepo: ResumeRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly storage: StorageService,
  ) {}

  async get(candidateId: string) {
    const resume = await this.resumeRepo.findByCandidateId(candidateId);
    if (!resume) throw new NotFoundException('No resume found for candidate');
    return {
      id: resume.id,
      candidateId: resume.candidateId,
      fileUrl: resume.fileUrl,
      uploadedAt: resume.uploadedAt,
    };
  }

  async upload(candidateId: string, file: Express.Multer.File) {
    const candidate = await this.candidateRepo.findById(candidateId);
    if (!candidate) throw new NotFoundException('Candidate not found');
    this.assertSupportedType(file.mimetype);

    const ext = file.mimetype === PDF_MIME ? 'pdf' : 'docx';
    const key = `tenants/${getTenantId()}/resumes/${candidateId}/${randomUUID()}.${ext}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    await this.resumeRepo.create({ candidateId, fileUrl: key });
    return this.get(candidateId);
  }

  private assertSupportedType(mimeType: string) {
    if (mimeType !== PDF_MIME && mimeType !== DOCX_MIME) {
      throw new BadRequestException(
        'Unsupported file type. Only PDF and DOCX are allowed.',
      );
    }
  }
}
