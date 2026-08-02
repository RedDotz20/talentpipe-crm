# Phase 4 — Resume Upload & Skill Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build resume upload (PDF/DOCX → MinIO/S3), text extraction, skill extraction, and skill-match scoring end-to-end (NestJS backend + React/Mantine frontend), so a candidate's match score appears in the pipeline after a resume is uploaded.

**Architecture:** New `StorageModule` (`backend/src/common/storage/`) wraps an `@aws-sdk/client-s3` `S3Client` pointed at the local MinIO container (`MINIO_ENDPOINT`, `forcePathStyle: true`) — the same client works against real S3 in prod via env swap. New `ResumesModule` (`backend/src/modules/resumes/`) exposes `GET/POST /candidates/:candidateId/resume`; upload validates type+size, writes the buffer to MinIO under a server-generated key, creates the `resumes` DB row, extracts text (pdf-parse/mammoth), extracts skills via substring match against the public `skills` taxonomy, persists `resume_skills`, then recomputes `applications.match_score` for every application of that candidate against each job's required skills. New `SkillMatchingModule` (`backend/src/modules/skill-matching/`) provides the pure `computeScore` function. `CandidatesService.getOne` is enriched to return `{ ...candidate, resume, applications }`. Frontend adds `@mantine/dropzone`, a `resumesApi` + hooks, `ResumeUploadInput`, `MatchScoreBadge`, and surfaces both in `CandidateProfile`.

**Tech Stack:** NestJS 11 + Drizzle ORM + PostgreSQL (schema-per-tenant) + Zod 4, `@aws-sdk/client-s3` + MinIO, `pdf-parse` + `mammoth`, React 19 + Mantine 9 + TanStack Query 5 + TanStack Router 1.

## Global Constraints

- Error shape `{ "error": { "code", "message" } }`; success envelope `{ "data": ..., "message": "OK" }` (ResponseInterceptor wraps 2xx).
- All tenant-scoped DB access via repositories extending `BaseRepository` with `withDb('current', ...)`; public via `withDb('public', ...)`. No direct Drizzle outside `repositories/`.
- Roles: `OrgAdmin` (OA), `Recruiter` (R), `HiringManager` (HM). Resume GET: OA/R/HM. Resume POST: OA/R. Global `RolesGuard` + route-level `@UseGuards(AuthGuard('jwt'))`.
- MinIO object keys: `tenants/{tenantId}/resumes/{candidateId}/{uuid}.{ext}` — **server-generated only**, never client-supplied.
- Upload constraints: mimetype must be `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`; multer limit 10MB; reject otherwise with `BadRequestException` (400).
- `matchScore` recompute: for each of the candidate's applications, score = `computeScore(jobRequiredSkillIds, extractedSkillIds)` where `computeScore = required.length === 0 ? 0 : matched / required.length`. Persisted via `applications.match_score` (`updateMatchScore`).
- `@CurrentUser()` → `TenantContext { tenantId, userId, role }`; `getTenantId()` from ALS for object keys.
- Frontend mutations use `useApiMutation` (auto-toasts). Queries use TanStack Query under the feature folder.
- Backend unit tests follow the repo-mock pattern (`Test.createTestingModule`). Test files named `*.spec.ts` (Jest `testRegex`). Lint: backend ESLint, frontend oxlint. Typecheck: `npm run typecheck` both. Backend tests: `npm test`. Frontend build: `npm run build`.
- Commits tagged `feat(m4): ...`.
- Storage is MinIO from the start (NOT local disk). Bucket name from `MINIO_BUCKET` (default `resumes`), ensured at bootstrap (`onApplicationBootstrap`).

---

## Task 1: Backend deps + repositories

**Files:**
- Modify: `backend/package.json` (via npm install)
- Create: `backend/src/repositories/resume.repository.ts`
- Modify: `backend/src/repositories/skill.repository.ts`
- Modify: `backend/src/repositories/application.repository.ts`
- Modify: `backend/src/repositories/repositories.module.ts`

**Interfaces:**
- Consumes: `BaseRepository`, tables from `backend/src/database/schema.ts` (`resumes`, `resumeSkills`, `skills`, `candidates`, `applications`, `jobPostings`, `pipelineStages`).
- Produces:
  - `ResumeRepository` — `findByCandidateId(candidateId): Promise<Resume | null>`, `create({candidateId, fileUrl})`, `updateParsedText(id, parsedText)`, `setResumeSkills(resumeId, skillIds)`, `findSkillsByResumeId(resumeId): Promise<{ id, name, category }[]>`.
  - `SkillRepository.findAll(): Promise<Skill[]>` — all skills (for matching), public schema.
  - `ApplicationRepository.findByCandidateId(candidateId)` — joined app rows (same shape as `findAll`); `updateMatchScore(id, score)`.

- [ ] **Step 1: Install backend deps**

Run: `cd backend && npm install pdf-parse mammoth @aws-sdk/client-s3 && npm install -D @types/pdf-parse @types/mammoth @types/multer`
Expected: deps added to `backend/package.json` and lockfile.

- [ ] **Step 2: Create `resume.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { resumes, resumeSkills, skills } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class ResumeRepository extends BaseRepository {
  async findByCandidateId(candidateId: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .select()
        .from(resumes)
        .where(eq(resumes.candidateId, candidateId))
        .orderBy(desc(resumes.uploadedAt))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { candidateId: string; fileUrl: string }) {
    return this.withDb('current', async (db) => {
      const rows = await db.insert(resumes).values(data).returning().execute();
      return rows[0];
    });
  }

  async updateParsedText(id: string, parsedText: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .update(resumes)
        .set({ parsedText })
        .where(eq(resumes.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async setResumeSkills(resumeId: string, skillIds: string[]) {
    return this.withDb('current', async (db) => {
      await db
        .delete(resumeSkills)
        .where(eq(resumeSkills.resumeId, resumeId))
        .execute();
      if (skillIds.length > 0) {
        await db
          .insert(resumeSkills)
          .values(skillIds.map((skillId) => ({ resumeId, skillId })))
          .execute();
      }
    });
  }

  async findSkillsByResumeId(resumeId: string) {
    return this.withDb('current', async (db) => {
      return db
        .select({ id: skills.id, name: skills.name, category: skills.category })
        .from(resumeSkills)
        .innerJoin(skills, eq(resumeSkills.skillId, skills.id))
        .where(eq(resumeSkills.resumeId, resumeId))
        .execute();
    });
  }
}
```

- [ ] **Step 3: Add `findAll()` to `skill.repository.ts`**

```ts
  async findAll() {
    return this.withDb('public', async (db) => {
      return db.select().from(skills).orderBy(skills.name).execute();
    });
  }
```

- [ ] **Step 4: Add `findByCandidateId` + `updateMatchScore` to `application.repository.ts`**

```ts
  async findByCandidateId(candidateId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select(selectAppRow)
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .where(eq(applications.candidateId, candidateId))
        .orderBy(desc(applications.appliedAt))
        .execute();
    });
  }

  async updateMatchScore(id: string, matchScore: number, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(applications)
        .set({ matchScore })
        .where(eq(applications.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
```

- [ ] **Step 5: Register `ResumeRepository` in `repositories.module.ts`** — import + add to `REPOSITORIES`.

- [ ] **Step 6: Typecheck** — run `cd backend && npm run typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/repositories backend/package.json backend/package-lock.json
git commit -m "feat(m4): resume repository + skill/application repo extensions, storage deps"
```

---

## Task 2: MinIO storage module

**Files:**
- Create: `backend/src/common/storage/storage.provider.ts`
- Create: `backend/src/common/storage/storage.service.ts`
- Create: `backend/src/common/storage/storage.module.ts`

**Interfaces:**
- Consumes: `ConfigService`, `S3Client`/`CreateBucketCommand`/`PutObjectCommand`/`GetObjectCommand`/`DeleteObjectCommand`/`HeadBucketCommand` from `@aws-sdk/client-s3`.
- Produces:
  - `STORAGE_PROVIDER` injection token + `StorageService`:
    - `ensureBucket(): Promise<void>` — head bucket, create if missing.
    - `upload(key: string, buffer: Buffer, contentType: string): Promise<void>`
    - `get(key: string): Promise<Buffer | null>`
    - `delete(key: string): Promise<void>`
  - `StorageModule` exports `StorageService`.

- [ ] **Step 1: `storage.provider.ts`**

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export const storageProvider = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new S3Client({
      region: config.get<string>('MINIO_REGION') ?? 'us-east-1',
      endpoint: config.get<string>('MINIO_ENDPOINT') ?? 'http://localhost:9000',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin',
        secretAccessKey:
          config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin',
      },
    });
  },
};
```

- [ ] **Step 2: `storage.service.ts`**

```ts
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { STORAGE_PROVIDER } from './storage.provider';

@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly client: S3Client,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'resumes';
  }

  async onApplicationBootstrap() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.bucket }),
      );
    } catch {
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.bucket }),
      );
      this.logger.log(`Created bucket "${this.bucket}"`);
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
```

- [ ] **Step 3: `storage.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { storageProvider } from './storage.provider';

@Module({
  providers: [StorageService, storageProvider],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 4: Typecheck** — `cd backend && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/storage
git commit -m "feat(m4): MinIO/S3 storage module with bucket bootstrap"
```

---

## Task 3: SkillMatchingModule (TDD)

**Files:**
- Create: `backend/src/modules/skill-matching/skill-matching.service.ts`
- Create: `backend/src/modules/skill-matching/skill-matching.service.spec.ts`
- Create: `backend/src/modules/skill-matching/skill-matching.module.ts`

**Interfaces:**
- Produces: `SkillMatchingService.computeScore(requiredSkillIds: string[], extractedSkillIds: string[]): number` (0..1). `SkillMatchingModule` exports `SkillMatchingService`.

- [ ] **Step 1: Write the failing spec**

```ts
import { SkillMatchingService } from './skill-matching.service';

describe('SkillMatchingService', () => {
  let service: SkillMatchingService;

  beforeEach(() => {
    service = new SkillMatchingService();
  });

  it('returns 0 when there are no required skills', () => {
    expect(service.computeScore([], ['s1'])).toBe(0);
  });

  it('returns 1 for a full match', () => {
    expect(service.computeScore(['s1', 's2'], ['s1', 's2', 's3'])).toBe(1);
  });

  it('returns partial score for a partial match', () => {
    expect(service.computeScore(['s1', 's2', 's3'], ['s1'])).toBeCloseTo(
      1 / 3,
    );
  });

  it('returns 0 when nothing matches', () => {
    expect(service.computeScore(['s1', 's2'], ['s3', 's4'])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest skill-matching --silent`
Expected: FAIL (`SkillMatchingService` does not exist).

- [ ] **Step 3: Implement the service**

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class SkillMatchingService {
  computeScore(requiredSkillIds: string[], extractedSkillIds: string[]): number {
    if (requiredSkillIds.length === 0) return 0;
    const required = new Set(requiredSkillIds);
    const matched = extractedSkillIds.filter((id) => required.has(id)).length;
    return matched / requiredSkillIds.length;
  }
}
```

- [ ] **Step 4: Module**

```ts
import { Module } from '@nestjs/common';
import { SkillMatchingService } from './skill-matching.service';

@Module({
  providers: [SkillMatchingService],
  exports: [SkillMatchingService],
})
export class SkillMatchingModule {}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && npx jest skill-matching --silent`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/skill-matching
git commit -m "feat(m4): skill matching service with unit tests"
```

---

## Task 4: ResumesModule

**Files:**
- Create: `backend/src/modules/resumes/resumes.service.ts`
- Create: `backend/src/modules/resumes/resumes.controller.ts`
- Create: `backend/src/modules/resumes/resumes.module.ts`
- Create: `backend/src/modules/resumes/resumes.service.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `ResumeRepository`, `CandidateRepository`, `SkillRepository`, `ApplicationRepository`, `JobPostingRepository` (via `RepositoriesModule`), `StorageService` (via `StorageModule`), `SkillMatchingService` (via `SkillMatchingModule`), `getTenantId()` from `common/context/tenant-context`, `randomUUID()` from `node:crypto`, `pdf-parse`, `mammoth`.
- Produces:
  - `ResumesService.get(candidateId)` → `{ ...resumeRow, skills }` or 404 when no resume.
  - `ResumesService.upload(candidateId, file: Express.Multer.File)` → the enriched resume record; validates candidate exists (404), mimetype (400), 10MB (multer), uploads to MinIO, creates row, extracts text + skills, persists skills, recomputes matchScore for all the candidate's applications.
  - Endpoints (global prefix `api`):
    - `GET /candidates/:candidateId/resume` — OA/R/HM
    - `POST /candidates/:candidateId/resume` — OA/R, `FileInterceptor('file')`, 10MB limit

- [ ] **Step 1: Service**

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as pdfParse from 'pdf-parse';
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
    if (parsedText) {
      await this.resumeRepo.updateParsedText(resume.id, parsedText);
    }

    const matchedSkillIds = await this.extractSkills(parsedText ?? '');
    await this.resumeRepo.setResumeSkills(resume.id, matchedSkillIds);

    await this.recomputeScores(candidateId, matchedSkillIds);

    return this.get(candidateId);
  }

  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === PDF_MIME) {
      const parsed = await pdfParse(buffer);
      return parsed.text ?? '';
    }
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
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
      const score = this.skillMatching.computeScore(required, extractedSkillIds);
      await this.applicationRepo.updateMatchScore(application.id, score);
    }
  }
}
```

- [ ] **Step 2: Controller**

```ts
import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ResumesService } from './resumes.service';

const VIEW_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];
const EDIT_ROLES = ['OrgAdmin', 'Recruiter'];

@Controller('candidates')
export class ResumesController {
  constructor(private readonly resumesService: ResumesService) {}

  @Get(':candidateId/resume')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  get(@Param('candidateId') candidateId: string) {
    return this.resumesService.get(candidateId);
  }

  @Post(':candidateId/resume')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  upload(
    @Param('candidateId') candidateId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.resumesService.upload(candidateId, file);
  }
}
```

- [ ] **Step 3: Module**

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { StorageModule } from '../../common/storage/storage.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { SkillMatchingModule } from '../skill-matching/skill-matching.module';
import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';

@Module({
  imports: [
    AuthCoreModule,
    StorageModule,
    RepositoriesModule,
    SkillMatchingModule,
  ],
  controllers: [ResumesController],
  providers: [ResumesService],
})
export class ResumesModule {}
```

- [ ] **Step 4: Unit tests**

```ts
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

const PDF_FILE = {
  buffer: Buffer.from('%PDF-test'),
  mimetype: 'application/pdf',
} as Express.Multer.File;

describe('ResumesService', () => {
  let service: ResumesService;
  const resumeRepo = {
    findByCandidateId: jest.fn(),
    create: jest.fn(),
    updateParsedText: jest.fn(),
    setResumeSkills: jest.fn(),
    findSkillsByResumeId: jest.fn(),
  };
  const candidateRepo = { findById: jest.fn() };
  const skillRepo = { findAll: jest.fn() };
  const applicationRepo = {
    findByCandidateId: jest.fn(),
    updateMatchScore: jest.fn(),
  };
  const jobPostingRepo = { getRequiredSkillIds: jest.fn() };
  const storage = {
    upload: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };
  const skillMatching = new SkillMatchingService();

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

  it('get returns resume with skills', async () => {
    resumeRepo.findByCandidateId.mockResolvedValue({
      id: 'r1',
      fileUrl: 'k',
      parsedText: 'x',
    });
    resumeRepo.findSkillsByResumeId.mockResolvedValue([{ id: 's1' }]);
    await expect(service.get('c1')).resolves.toEqual({
      id: 'r1',
      fileUrl: 'k',
      parsedText: 'x',
      skills: [{ id: 's1' }],
    });
  });

  it('upload throws NotFoundException when candidate is missing', async () => {
    candidateRepo.findById.mockResolvedValue(null);
    await expect(
      runInContext(() => service.upload('nope', PDF_FILE)),
    ).rejects.toThrow(NotFoundException);
  });

  it('upload rejects unsupported file types', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1' });
    const txt = { buffer: Buffer.from('x'), mimetype: 'text/plain' };
    await expect(
      runInContext(() => service.upload('c1', txt as Express.Multer.File)),
    ).rejects.toThrow(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('upload stores file, persists skills, and recomputes scores', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1' });
    resumeRepo.create.mockResolvedValue({ id: 'r1', fileUrl: 'key', candidateId: 'c1' });
    skillRepo.findAll.mockResolvedValue([
      { id: 's1', name: 'React' },
      { id: 's2', name: 'Node.js' },
    ]);
    applicationRepo.findByCandidateId.mockResolvedValue([
      { id: 'a1', jobPostingId: 'j1' },
    ]);
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['s1']);
    resumeRepo.findSkillsByResumeId.mockResolvedValue([{ id: 's1', name: 'React' }]);
    resumeRepo.findByCandidateId.mockResolvedValue({
      id: 'r1',
      fileUrl: 'key',
      parsedText: 'React experience',
    });

    const result = await runInContext(() => service.upload('c1', PDF_FILE));

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^tenants\/t1\/resumes\/c1\/.+\.pdf$/),
      PDF_FILE.buffer,
      'application/pdf',
    );
    expect(resumeRepo.setResumeSkills).toHaveBeenCalledWith('r1', ['s1']);
    expect(applicationRepo.updateMatchScore).toHaveBeenCalledWith('a1', 1);
    expect(result).toEqual(
      expect.objectContaining({ id: 'r1', skills: [{ id: 's1', name: 'React' }] }),
    );
  });
});
```

- [ ] **Step 5: Register `ResumesModule` in `app.module.ts`** — add import.

- [ ] **Step 6: Typecheck + tests**

Run: `cd backend && npm run typecheck && npm test`
Expected: typecheck PASS; skill-matching + resumes specs green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/resumes backend/src/app.module.ts
git commit -m "feat(m4): resumes module with MinIO upload, text extraction, skill matching"
```

---

## Task 5: Candidate profile enrichment

**Files:**
- Modify: `backend/src/modules/candidates/candidates.service.ts`
- Modify: `backend/src/modules/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `CandidateRepository`, `ResumeRepository`, `ApplicationRepository`.
- Produces: `CandidatesService.getOne(id)` → `{ ...candidate, resume: { ...resume, skills } | null, applications }`.

- [ ] **Step 1: Enrich `getOne`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CandidateRepository } from '../../repositories/candidate.repository';
import { ResumeRepository } from '../../repositories/resume.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { CreateCandidateDto } from './dto/create-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly candidateRepo: CandidateRepository,
    private readonly resumeRepo: ResumeRepository,
    private readonly applicationRepo: ApplicationRepository,
  ) {}

  list() {
    return this.candidateRepo.findAll();
  }

  async getOne(id: string) {
    const candidate = await this.candidateRepo.findById(id);
    if (!candidate) throw new NotFoundException('Candidate not found');
    const resume = await this.resumeRepo.findByCandidateId(id);
    const applications = await this.applicationRepo.findByCandidateId(id);
    return {
      ...candidate,
      resume: resume
        ? { ...resume, skills: await this.resumeRepo.findSkillsByResumeId(resume.id) }
        : null,
      applications,
    };
  }

  create(dto: CreateCandidateDto) {
    return this.candidateRepo.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
    });
  }
}
```

- [ ] **Step 2: Update the spec** — add `resumeRepo` (`findByCandidateId`, `findSkillsByResumeId`) and `applicationRepo` (`findByCandidateId`) mocks; update `getOne` tests to expect `resume` + `applications` shape.

- [ ] **Step 3: Typecheck + tests**

Run: `cd backend && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/candidates
git commit -m "feat(m4): candidate profile includes resume and applications"
```

---

## Task 6: Frontend API layer

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Create: `frontend/src/api/resumesApi.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Create: `frontend/src/features/org/candidates/hooks/useResume.ts`

**Interfaces:**
- Consumes: `apiClient` (`@/api/client`), `ApiEnvelope` (`@/hooks/useApiMutation`), `queryKeys`, `useApiMutation`.
- Produces:
  - `Resume { id, candidateId, fileUrl: string | null, parsedText: string | null, uploadedAt: string, skills: Skill[] }`.
  - `resumesApi.get(candidateId): Promise<Resume>`; `resumesApi.upload(candidateId, file: File): Promise<Resume>` (FormData).
  - `queryKeys.org.resume(candidateId)`.
  - Hooks: `useResume(candidateId)`, `useUploadResume(candidateId)`.

- [ ] **Step 1: Install `@mantine/dropzone`**

Run: `cd frontend && npm install @mantine/dropzone`
Expected: added to `frontend/package.json`.

- [ ] **Step 2: `api/resumesApi.ts`**

```ts
import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type { Skill } from './skillsApi';

export interface Resume {
  id: string;
  candidateId: string;
  fileUrl: string | null;
  parsedText: string | null;
  uploadedAt: string;
  skills: Skill[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const resumesApi = {
  get: async (candidateId: string): Promise<Resume> => {
    const { data } = await apiClient.get(`/candidates/${candidateId}/resume`);
    return unwrap(data as ApiEnvelope<Resume>);
  },
  upload: async (candidateId: string, file: File): Promise<Resume> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post(
      `/candidates/${candidateId}/resume`,
      formData,
      { headers: { 'Content-Type': undefined } },
    );
    return unwrap(data as ApiEnvelope<Resume>);
  },
};
```

- [ ] **Step 3: `queryKeys.ts`** — add to `org` group:

```ts
resume: (candidateId: string) => ['org', 'candidates', candidateId, 'resume'],
```

- [ ] **Step 4: `features/org/candidates/hooks/useResume.ts`**

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resumesApi } from '@/api/resumesApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useResume(candidateId: string) {
  return useQuery({
    queryKey: queryKeys.org.resume(candidateId),
    queryFn: () => resumesApi.get(candidateId),
    enabled: !!candidateId,
    retry: false,
  });
}

export function useUploadResume(candidateId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (file: File) => resumesApi.upload(candidateId, file),
    successMessage: 'Resume uploaded and analyzed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.resume(candidateId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.org.candidate(candidateId) });
    },
  });
}
```

- [ ] **Step 5: Typecheck + lint** — `cd frontend && npm run typecheck && npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api frontend/src/features/org/candidates/hooks frontend/package.json
git commit -m "feat(m4): resumes API client, query keys, hooks"
```

---

## Task 7: Frontend components

**Files:**
- Create: `frontend/src/features/org/candidates/MatchScoreBadge.tsx`
- Create: `frontend/src/features/org/candidates/ResumeUploadInput.tsx`
- Modify: `frontend/src/features/org/candidates/CandidateProfile.tsx`
- Modify: `frontend/src/features/org/pipeline/ApplicationCard.tsx` (reuse `MatchScoreBadge`)

**Interfaces:**
- Consumes: Task 6 hooks, `@mantine/dropzone`, Mantine primitives.
- Produces: `MatchScoreBadge({ score: number | null })`, `ResumeUploadInput({ candidateId })`, enriched `CandidateProfile`.

- [ ] **Step 1: `MatchScoreBadge.tsx`**

```tsx
import { Badge } from '@mantine/core';

function matchColor(score: number | null): string {
  if (score === null) return 'gray';
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'yellow';
  return 'red';
}

export function MatchScoreBadge({ score }: { score: number | null }) {
  const label = score === null ? '—' : `${Math.round(score * 100)}%`;
  return (
    <Badge size="xs" color={matchColor(score)} variant="light">
      {label}
    </Badge>
  );
}
```

- [ ] **Step 2: `ResumeUploadInput.tsx`**

```tsx
import { Group, Text, rem } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { IconUpload } from '@tabler/icons-react';
import { useUploadResume } from './hooks/useResume';

const ACCEPT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function ResumeUploadInput({ candidateId }: { candidateId: string }) {
  const upload = useUploadResume(candidateId);

  return (
    <Dropzone
      onDrop={(files) => {
        const file = files[0];
        if (file) upload.mutate(file);
      }}
      accept={ACCEPT}
      maxSize={10 * 1024 * 1024}
      loading={upload.isPending}
    >
      <Group justify="center" gap="xl" style={{ pointerEvents: 'none' }}>
        <IconUpload style={{ width: rem(40), height: rem(40) }} stroke={1.5} />
        <div>
          <Text size="sm">Drop a resume (PDF or DOCX, max 10MB)</Text>
          <Text size="xs" c="dimmed">
            Text is extracted and matched against required job skills.
          </Text>
        </div>
      </Group>
    </Dropzone>
  );
}
```

- [ ] **Step 3: Enrich `CandidateProfile.tsx`** — add resume section (upload input when absent, skills badges + parsed text preview when present) and applications table with `MatchScoreBadge`. Update `Candidate` type in `candidatesApi.ts` to include `resume?` + `applications?`.

- [ ] **Step 4: Reuse `MatchScoreBadge` in `ApplicationCard.tsx`** — replace the inline score badge logic.

- [ ] **Step 5: Typecheck + lint + build**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/org/candidates frontend/src/features/org/pipeline frontend/src/api/candidatesApi.ts
git commit -m "feat(m4): resume upload input, match score badge, candidate profile integration"
```

---

## Task 8: Final verification

- [ ] **Step 1: Backend** — `cd backend && npm run typecheck && npm test && npm run lint`. Expected: all pass.
- [ ] **Step 2: Frontend** — `cd frontend && npm run typecheck && npm run lint && npm run build`. Expected: all pass.
- [ ] **Step 3: Manual smoke** — ensure `docker compose up -d` (postgres/redis/minio). Start backend + frontend. Sign in as `admin@acme.com` / `Admin123!`. Open a candidate profile, upload a PDF/DOCX resume, verify the resume metadata + extracted skills appear and the candidate's applications show a match score in `/org/pipeline`. Check the `resumes` bucket in the MinIO console (`http://localhost:9001`, minioadmin/minioadmin) contains `tenants/{tenantId}/resumes/{candidateId}/...`.
