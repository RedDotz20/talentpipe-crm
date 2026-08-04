import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getTenantId } from '../../common/context/tenant-context';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { StorageService } from '../../common/storage/storage.service';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class ResumesService {
  constructor(
    private readonly candidateAccountRepo: CandidateAccountRepository,
    private readonly storage: StorageService,
  ) {}

  async get(candidateAccountId: string) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account || !account.resumeFileUrl) {
      throw new NotFoundException('No resume found for candidate');
    }
    return {
      fileUrl: account.resumeFileUrl,
      uploadedAt: account.resumeUploadedAt,
    };
  }

  async upload(candidateAccountId: string, file: Express.Multer.File) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate not found');
    this.assertSupportedType(file.mimetype);

    const ext = file.mimetype === PDF_MIME ? 'pdf' : 'docx';
    const tenantId = getTenantId();
    const key =
      tenantId === 'public'
        ? `candidate-resumes/${candidateAccountId}/${randomUUID()}.${ext}`
        : `tenants/${tenantId}/resumes/${candidateAccountId}/${randomUUID()}.${ext}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    // Delete old resume file from S3 if exists
    if (account.resumeFileUrl) {
      await this.storage.delete(account.resumeFileUrl);
    }

    await this.candidateAccountRepo.uploadResume(candidateAccountId, key);
    return this.get(candidateAccountId);
  }

  async remove(candidateAccountId: string) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate not found');
    if (account.resumeFileUrl) {
      await this.storage.delete(account.resumeFileUrl);
    }
    return this.candidateAccountRepo.removeResume(candidateAccountId);
  }

  private assertSupportedType(mimeType: string) {
    if (mimeType !== PDF_MIME && mimeType !== DOCX_MIME) {
      throw new BadRequestException(
        'Unsupported file type. Only PDF and DOCX are allowed.',
      );
    }
  }
}
