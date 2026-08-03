import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { getTenantId } from '../../common/context/tenant-context';
import { ResumeRepository } from '../../repositories/resume.repository';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { StorageService } from '../../common/storage/storage.service';
import { SkillMatchingService } from '../skill-matching/skill-matching.service';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class ResumesService {
  constructor(
    private readonly resumeRepo: ResumeRepository,
    private readonly candidateRepo: CandidateRepository,
    private readonly skillRepo: SkillRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly storage: StorageService,
    private readonly skillMatching: SkillMatchingService,
  ) {}

  async get(candidateId: string) {
    const resume = await this.resumeRepo.findByCandidateId(candidateId);
    if (!resume) throw new NotFoundException('No resume found for candidate');
    const skills = await this.resumeRepo.findSkillsByResumeId(resume.id);
    return { ...resume, skills };
  }

  async upload(candidateId: string, file: Express.Multer.File) {
    const candidate = await this.candidateRepo.findById(candidateId);
    if (!candidate) throw new NotFoundException('Candidate not found');
    this.assertSupportedType(file.mimetype);

    const ext = file.mimetype === PDF_MIME ? 'pdf' : 'docx';
    const key = `tenants/${getTenantId()}/resumes/${candidateId}/${randomUUID()}.${ext}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const resume = await this.resumeRepo.create({ candidateId, fileUrl: key });

    const parsedText = await this.extractText(file.buffer, file.mimetype);

    const matchedSkillIds = await this.extractSkills(parsedText ?? '');
    await this.resumeRepo.setResumeSkills(resume.id, matchedSkillIds);

    await this.recomputeScores(candidateId, matchedSkillIds);

    return this.get(candidateId);
  }

  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === PDF_MIME) {
        const parsed = await pdfParse(
          new Uint8Array(buffer) as unknown as Buffer,
        );
        return parsed.text ?? '';
      }
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    } catch {
      return '';
    }
  }

  async extractSkills(text: string): Promise<string[]> {
    const all = await this.skillRepo.findAll();
    const lower = text.toLowerCase();
    return all
      .filter((skill) => lower.includes(skill.name.toLowerCase()))
      .map((skill) => skill.id);
  }

  private assertSupportedType(mimeType: string) {
    if (mimeType !== PDF_MIME && mimeType !== DOCX_MIME) {
      throw new BadRequestException(
        'Unsupported file type. Only PDF and DOCX are allowed.',
      );
    }
  }

  private async recomputeScores(
    candidateId: string,
    extractedSkillIds: string[],
  ) {
    const applications =
      await this.applicationRepo.findByCandidateId(candidateId);
    for (const application of applications) {
      const required = await this.jobPostingRepo.getRequiredSkillIds(
        application.jobPostingId,
      );
      const score = this.skillMatching.computeScore(
        required,
        extractedSkillIds,
      );
      await this.applicationRepo.updateMatchScore(application.id, score);
    }
  }
}
