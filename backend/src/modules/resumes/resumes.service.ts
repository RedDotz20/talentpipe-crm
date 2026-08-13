import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getCompanyId } from '../../common/context/company-context';
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

  async getFile(candidateAccountId: string) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    const key = account?.resumeFileUrl;
    if (!key) throw new NotFoundException('No resume found for candidate');
    const buffer = await this.storage.get(key);
    if (!buffer) {
      throw new NotFoundException('Resume file not found in storage');
    }
    const isDocx = key.endsWith('.docx');
    return {
      buffer,
      contentType: isDocx ? DOCX_MIME : PDF_MIME,
      filename: `resume.${isDocx ? 'docx' : 'pdf'}`,
    };
  }

  async upload(candidateAccountId: string, file: Express.Multer.File) {
    const account =
      await this.candidateAccountRepo.findById(candidateAccountId);
    if (!account) throw new NotFoundException('Candidate not found');
    this.assertSupportedType(file.mimetype);
    this.assertSupportedContent(file.buffer, file.mimetype);

    const ext = file.mimetype === PDF_MIME ? 'pdf' : 'docx';
    const companyId = getCompanyId();
    const key =
      companyId === 'public'
        ? `candidate-resumes/${candidateAccountId}/${randomUUID()}.${ext}`
        : `companies/${companyId}/resumes/${candidateAccountId}/${randomUUID()}.${ext}`;
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

  private assertSupportedContent(buffer: Buffer, mimeType: string) {
    const isPdf =
      mimeType === PDF_MIME &&
      buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    const isDocx =
      mimeType === DOCX_MIME &&
      buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (!isPdf && !isDocx) {
      throw new BadRequestException(
        'File content does not match an allowed type (PDF or DOCX)',
      );
    }
  }
}
