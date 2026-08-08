# Phase 3 — Pipeline (Kanban Board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the company pipeline Kanban board end-to-end — applications list/detail, drag-and-drop stage moves with optimistic updates, notes, and CompanyAdmin stage management (NestJS backend + React/Mantine frontend).

**Architecture:** New `ApplicationsModule` (`backend/src/modules/applications/`) exposing `GET/PATCH /applications`, `PATCH /applications/:id/stage`, `POST/GET /applications/:id/notes`, and a new `PipelineStagesModule` (`backend/src/modules/pipeline-stages/`) exposing `GET/POST/PATCH/DELETE /company/pipeline-stages`. DB access via extended `ApplicationRepository` (joined rows), extended `PipelineStageRepository` (full CRUD + reference count), and new `NoteRepository`. Stage moves also sync the public `candidate_applications_index.status` (guide §5b.5). Frontend renders a dnd-kit board under `frontend/src/features/company/pipeline/` at route `/company/pipeline`, with optimistic `useUpdateStage`.

**Tech Stack:** NestJS 11 + Drizzle ORM + PostgreSQL (schema-per-company), Zod 4, React 19 + Mantine 9 + TanStack Query 5 + TanStack Router 1 + dnd-kit.

## Global Constraints

- Error shape `{ "error": { "code", "message" } }`; success envelope `{ "data": ..., "message": "OK" }` (ResponseInterceptor wraps 2xx).
- All company-scoped DB access via repositories extending `BaseRepository` with `withDb('current', ...)`; public via `withDb('public', ...)`. No direct Drizzle outside `repositories/`.
- Roles: `CompanyAdmin`, `Recruiter`, `HiringManager`, `Interviewer`, `SuperAdmin`, `Candidate`. Global `RolesGuard` + route-level `@UseGuards(AuthGuard('jwt'))`.
- Applications endpoints: `CompanyAdmin`/`Recruiter`/`HiringManager`. Pipeline-stages write endpoints: `CompanyAdmin` only. Pipeline-stages GET: any internal role (incl. `Interviewer`).
- `PATCH /applications/:id/stage` body `{ stageId }`; must 404 when the application or stage is missing (cross-company → 404, never 403). After update, sync `candidate_applications_index.status` to the new stage name (no-op when no index row exists).
- `DELETE /company/pipeline-stages/:id` → `ConflictException` (409) when any application references the stage.
- Notes: `POST /applications/:id/notes` body `{ content }`, author from `@CurrentUser()`.
- `@CurrentUser()` → `CompanyContext { companyId, userId, role }`.
- Frontend mutations use `useApiMutation` (auto-toasts; `silent: true` for drag/reorder mutations). Queries use TanStack Query under the feature folder.
- Backend unit tests follow the repo-mock pattern (`Test.createTestingModule`). Lint: backend ESLint, frontend oxlint. Typecheck: `npm run typecheck` both. Backend tests: `npm test`. Frontend build: `npm run build` (regenerates `routeTree.gen.ts`).
- Commits tagged `feat(m3): ...`.

---

## Task 1: Backend repositories

**Files:**
- Modify: `backend/src/repositories/pipeline-stage.repository.ts`
- Modify: `backend/src/repositories/application.repository.ts`
- Create: `backend/src/repositories/note.repository.ts`
- Modify: `backend/src/repositories/repositories.module.ts`

**Interfaces:**
- Consumes: `BaseRepository`, `DrizzleSchemaService`, tables from `backend/src/database/schema.ts`.
- Produces:
  - `PipelineStageRepository` — `findAll(schema?)`, `findFirst(schema?)`, `findById(id, schema?)`, `create({name, order}, schema?)`, `update(id, {name?, order?}, schema?)`, `delete(id, schema?)`, `countApplicationsForStage(stageId, schema?): Promise<boolean>`, `createMany(names, schema?)`.
  - `ApplicationRepository` — existing `create`; new `findAll(filters?: { jobPostingId?, stageId? }, schema?)` returning joined rows `{ id, candidateId, jobPostingId, currentStageId, matchScore, appliedAt, candidateName, candidateEmail, jobTitle, stageName }`; `findById(id, schema?)` (same joined shape); `updateStage(id, stageId, schema?)`.
  - `NoteRepository` — `findByApplicationId(applicationId)`, `create({applicationId, authorUserId, content})`.

- [ ] **Step 1: Rewrite `pipeline-stage.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { pipelineStages, applications } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class PipelineStageRepository extends BaseRepository {
  async findAll(schema = 'current') {
    return this.withDb(schema, async (db) => {
      return db
        .select()
        .from(pipelineStages)
        .orderBy(pipelineStages.order)
        .execute();
    });
  }

  async findFirst(schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(pipelineStages)
        .orderBy(pipelineStages.order)
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { name: string; order: number }, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(pipelineStages)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async update(
    id: string,
    data: Partial<{ name: string; order: number }>,
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(pipelineStages)
        .set(data)
        .where(eq(pipelineStages.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async delete(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      await db
        .delete(pipelineStages)
        .where(eq(pipelineStages.id, id))
        .execute();
    });
  }

  async countApplicationsForStage(stageId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.currentStageId, stageId))
        .limit(1)
        .execute();
      return rows.length > 0;
    });
  }

  async createMany(names: string[], schema = 'current') {
    return this.withDb(schema, async (db) => {
      await db
        .insert(pipelineStages)
        .values(names.map((name, order) => ({ name, order })))
        .execute();
    });
  }
}
```

- [ ] **Step 2: Rewrite `application.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc, and } from 'drizzle-orm';
import {
  applications,
  candidates,
  jobPostings,
  pipelineStages,
} from '../database/schema';
import { BaseRepository } from './base.repository';

const selectAppRow = {
  id: applications.id,
  candidateId: applications.candidateId,
  jobPostingId: applications.jobPostingId,
  currentStageId: applications.currentStageId,
  matchScore: applications.matchScore,
  appliedAt: applications.appliedAt,
  candidateName: candidates.name,
  candidateEmail: candidates.email,
  jobTitle: jobPostings.title,
  stageName: pipelineStages.name,
};

@Injectable()
export class ApplicationRepository extends BaseRepository {
  async create(
    data: { candidateId: string; jobPostingId: string; currentStageId: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(applications)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async findAll(
    filters?: { jobPostingId?: string; stageId?: string },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const conditions = [];
      if (filters?.jobPostingId) {
        conditions.push(eq(applications.jobPostingId, filters.jobPostingId));
      }
      if (filters?.stageId) {
        conditions.push(eq(applications.currentStageId, filters.stageId));
      }
      let query = db
        .select(selectAppRow)
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .orderBy(desc(applications.appliedAt));
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      return query.execute();
    });
  }

  async findById(id: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select(selectAppRow)
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
        .leftJoin(
          pipelineStages,
          eq(applications.currentStageId, pipelineStages.id),
        )
        .where(eq(applications.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateStage(id: string, stageId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(applications)
        .set({ currentStageId: stageId })
        .where(eq(applications.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
}
```

- [ ] **Step 3: Create `note.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { notes } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class NoteRepository extends BaseRepository {
  async findByApplicationId(applicationId: string) {
    return this.withDb('current', async (db) => {
      return db
        .select()
        .from(notes)
        .where(eq(notes.applicationId, applicationId))
        .orderBy(desc(notes.createdAt))
        .execute();
    });
  }

  async create(data: {
    applicationId: string;
    authorUserId: string;
    content: string;
  }) {
    return this.withDb('current', async (db) => {
      const rows = await db.insert(notes).values(data).returning().execute();
      return rows[0];
    });
  }
}
```

- [ ] **Step 4: Register `NoteRepository` in `repositories.module.ts`** — add the import and add `NoteRepository` to the `REPOSITORIES` array.

- [ ] **Step 5: Typecheck** — run `cd backend && npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories
git commit -m "feat(m3): application and note repositories + pipeline-stage repo extensions"
```

---

## Task 2: Applications module (backend)

**Files:**
- Create: `backend/src/modules/applications/dto/update-stage.dto.ts`
- Create: `backend/src/modules/applications/dto/create-note.dto.ts`
- Create: `backend/src/modules/applications/applications.service.ts`
- Create: `backend/src/modules/applications/applications.controller.ts`
- Create: `backend/src/modules/applications/applications.module.ts`
- Create: `backend/src/modules/applications/applications.service.spec.ts`
- Modify: `backend/src/app.module.ts` (import `ApplicationsModule`)

**Interfaces:**
- Consumes: `ApplicationRepository`, `PipelineStageRepository`, `NoteRepository`, `CandidateApplicationsIndexRepository` (Task 1 + existing); `AuthCoreModule`, `RepositoriesModule`; `Roles`/`CurrentUser` decorators; `ZodValidationPipe`.
- Produces:
  - `ApplicationsService` — `list(filters?)`; `getOne(id)` → `{ ...joinedRow, notes }` or `NotFoundException`; `updateStage(id, dto)` (syncs index status, returns `getOne`); `addNote(user, id, dto)`; `listNotes(id)`.
  - Endpoints (global prefix `api`), all roles OA/R/HM:
    - `GET /applications?jobPostingId=&stageId=`
    - `GET /applications/:id`
    - `PATCH /applications/:id/stage`
    - `POST /applications/:id/notes`
    - `GET /applications/:id/notes`

- [ ] **Step 1: DTOs**

`update-stage.dto.ts`:
```ts
import { z } from 'zod';

export const UpdateStageSchema = z.object({
  stageId: z.string().uuid(),
});

export type UpdateStageDto = z.infer<typeof UpdateStageSchema>;
```

`create-note.dto.ts`:
```ts
import { z } from 'zod';

export const CreateNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;
```

- [ ] **Step 2: Service** — `applications.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { NoteRepository } from '../../repositories/note.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';
import { CompanyContext } from '../../common/context/company-context';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateNoteDto } from './dto/create-note.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applicationRepo: ApplicationRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly noteRepo: NoteRepository,
    private readonly candidateApplicationsIndexRepo: CandidateApplicationsIndexRepository,
  ) {}

  list(filters?: { jobPostingId?: string; stageId?: string }) {
    return this.applicationRepo.findAll(filters);
  }

  async getOne(id: string) {
    const application = await this.applicationRepo.findById(id);
    if (!application) throw new NotFoundException('Application not found');
    const notes = await this.noteRepo.findByApplicationId(id);
    return { ...application, notes };
  }

  async updateStage(id: string, dto: UpdateStageDto) {
    const application = await this.applicationRepo.findById(id);
    if (!application) throw new NotFoundException('Application not found');
    const stage = await this.pipelineStageRepo.findById(dto.stageId);
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    await this.applicationRepo.updateStage(id, dto.stageId);
    await this.candidateApplicationsIndexRepo.updateStatus(id, stage.name);
    return this.getOne(id);
  }

  async addNote(user: CompanyContext, id: string, dto: CreateNoteDto) {
    const application = await this.applicationRepo.findById(id);
    if (!application) throw new NotFoundException('Application not found');
    return this.noteRepo.create({
      applicationId: id,
      authorUserId: user.userId,
      content: dto.content,
    });
  }

  listNotes(id: string) {
    return this.noteRepo.findByApplicationId(id);
  }
}
```

- [ ] **Step 3: Controller** — `applications.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyContext } from '../../common/context/company-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApplicationsService } from './applications.service';
import { UpdateStageSchema, UpdateStageDto } from './dto/update-stage.dto';
import { CreateNoteSchema, CreateNoteDto } from './dto/create-note.dto';

const VIEW_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  list(
    @Query('jobPostingId') jobPostingId?: string,
    @Query('stageId') stageId?: string,
  ) {
    return this.applicationsService.list({ jobPostingId, stageId });
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  getOne(@Param('id') id: string) {
    return this.applicationsService.getOne(id);
  }

  @Patch(':id/stage')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  updateStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStageSchema)) dto: UpdateStageDto,
  ) {
    return this.applicationsService.updateStage(id, dto);
  }

  @Post(':id/notes')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateNoteSchema)) dto: CreateNoteDto,
    @CurrentUser() user: CompanyContext,
  ) {
    return this.applicationsService.addNote(user, id, dto);
  }

  @Get(':id/notes')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  listNotes(@Param('id') id: string) {
    return this.applicationsService.listNotes(id);
  }
}
```

- [ ] **Step 4: Module** — `applications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
```

- [ ] **Step 5: Unit tests** — `applications.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationRepository } from '../../repositories/application.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { NoteRepository } from '../../repositories/note.repository';
import { CandidateApplicationsIndexRepository } from '../../repositories/candidate-applications-index.repository';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  const applicationRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStage: jest.fn(),
  };
  const pipelineStageRepo = { findById: jest.fn() };
  const noteRepo = { findByApplicationId: jest.fn(), create: jest.fn() };
  const candidateApplicationsIndexRepo = { updateStatus: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: PipelineStageRepository, useValue: pipelineStageRepo },
        { provide: NoteRepository, useValue: noteRepo },
        {
          provide: CandidateApplicationsIndexRepository,
          useValue: candidateApplicationsIndexRepo,
        },
      ],
    }).compile();
    service = module.get<ApplicationsService>(ApplicationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists applications with filters', async () => {
    applicationRepo.findAll.mockResolvedValue([{ id: 'a1' }]);
    await expect(
      service.list({ jobPostingId: 'j1', stageId: 's1' }),
    ).resolves.toEqual([{ id: 'a1' }]);
    expect(applicationRepo.findAll).toHaveBeenCalledWith({
      jobPostingId: 'j1',
      stageId: 's1',
    });
  });

  it('getOne throws NotFoundException when missing', async () => {
    applicationRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('getOne returns the application with notes', async () => {
    applicationRepo.findById.mockResolvedValue({ id: 'a1', candidateName: 'Jane' });
    noteRepo.findByApplicationId.mockResolvedValue([{ id: 'n1', content: 'x' }]);
    await expect(service.getOne('a1')).resolves.toEqual({
      id: 'a1',
      candidateName: 'Jane',
      notes: [{ id: 'n1', content: 'x' }],
    });
  });

  it('updateStage throws when the application is missing', async () => {
    applicationRepo.findById.mockResolvedValue(null);
    await expect(service.updateStage('a1', { stageId: 's1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateStage throws when the stage is missing', async () => {
    applicationRepo.findById.mockResolvedValue({ id: 'a1' });
    pipelineStageRepo.findById.mockResolvedValue(null);
    await expect(service.updateStage('a1', { stageId: 's1' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateStage updates the record and syncs the index status', async () => {
    applicationRepo.findById.mockResolvedValue({ id: 'a1', candidateName: 'Jane' });
    pipelineStageRepo.findById.mockResolvedValue({ id: 's2', name: 'Interview' });
    applicationRepo.updateStage.mockResolvedValue({ id: 'a1' });
    noteRepo.findByApplicationId.mockResolvedValue([]);

    await service.updateStage('a1', { stageId: 's2' });

    expect(applicationRepo.updateStage).toHaveBeenCalledWith('a1', 's2');
    expect(candidateApplicationsIndexRepo.updateStatus).toHaveBeenCalledWith(
      'a1',
      'Interview',
    );
  });

  it('addNote creates a note with the current user', async () => {
    applicationRepo.findById.mockResolvedValue({ id: 'a1' });
    noteRepo.create.mockResolvedValue({ id: 'n1' });
    await expect(
      service.addNote(
        { companyId: 't1', userId: 'u1', role: 'CompanyAdmin' },
        'a1',
        { content: 'Phone screen scheduled' },
      ),
    ).resolves.toEqual({ id: 'n1' });
    expect(noteRepo.create).toHaveBeenCalledWith({
      applicationId: 'a1',
      authorUserId: 'u1',
      content: 'Phone screen scheduled',
    });
  });

  it('listNotes delegates to the note repo', async () => {
    noteRepo.findByApplicationId.mockResolvedValue([{ id: 'n1' }]);
    await expect(service.listNotes('a1')).resolves.toEqual([{ id: 'n1' }]);
    expect(noteRepo.findByApplicationId).toHaveBeenCalledWith('a1');
  });
});
```

- [ ] **Step 6: Register module in `app.module.ts`** — add `ApplicationsModule` to `imports`.

- [ ] **Step 7: Typecheck + tests** — `cd backend && npm run typecheck && npm test`. Expected: typecheck PASS; `applications.service.spec.ts` green.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/applications backend/src/app.module.ts
git commit -m "feat(m3): applications module with stage moves, notes, index sync"
```

---

## Task 3: Pipeline-stages module (backend)

**Files:**
- Create: `backend/src/modules/pipeline-stages/dto/create-pipeline-stage.dto.ts`
- Create: `backend/src/modules/pipeline-stages/dto/update-pipeline-stage.dto.ts`
- Create: `backend/src/modules/pipeline-stages/pipeline-stages.service.ts`
- Create: `backend/src/modules/pipeline-stages/pipeline-stages.controller.ts`
- Create: `backend/src/modules/pipeline-stages/pipeline-stages.module.ts`
- Create: `backend/src/modules/pipeline-stages/pipeline-stages.service.spec.ts`
- Modify: `backend/src/app.module.ts` (import `PipelineStagesModule`)

**Interfaces:**
- Consumes: `PipelineStageRepository` (Task 1), `AuthCoreModule`, `RepositoriesModule`, `Roles`, `ZodValidationPipe`.
- Produces:
  - `PipelineStagesService` — `list()`; `create(dto)` (order = current count); `update(id, dto)`; `remove(id)` (409 when referenced, 404 when missing).
  - Endpoints:
    - `GET /company/pipeline-stages` — internal roles
    - `POST /company/pipeline-stages` — OA
    - `PATCH /company/pipeline-stages/:id` — OA
    - `DELETE /company/pipeline-stages/:id` — OA

- [ ] **Step 1: DTOs**

`create-pipeline-stage.dto.ts`:
```ts
import { z } from 'zod';

export const CreatePipelineStageSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreatePipelineStageDto = z.infer<typeof CreatePipelineStageSchema>;
```

`update-pipeline-stage.dto.ts`:
```ts
import { z } from 'zod';

export const UpdatePipelineStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  order: z.number().int().min(0).optional(),
});

export type UpdatePipelineStageDto = z.infer<typeof UpdatePipelineStageSchema>;
```

- [ ] **Step 2: Service** — `pipeline-stages.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';

@Injectable()
export class PipelineStagesService {
  constructor(private readonly pipelineStageRepo: PipelineStageRepository) {}

  list() {
    return this.pipelineStageRepo.findAll();
  }

  async create(dto: CreatePipelineStageDto) {
    const stages = await this.pipelineStageRepo.findAll();
    return this.pipelineStageRepo.create({ name: dto.name, order: stages.length });
  }

  async update(id: string, dto: UpdatePipelineStageDto) {
    const stage = await this.pipelineStageRepo.findById(id);
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    return this.pipelineStageRepo.update(id, dto);
  }

  async remove(id: string) {
    const stage = await this.pipelineStageRepo.findById(id);
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    const referenced = await this.pipelineStageRepo.countApplicationsForStage(id);
    if (referenced) {
      throw new ConflictException('Cannot delete a stage that has applications');
    }
    await this.pipelineStageRepo.delete(id);
    return { id };
  }
}
```

- [ ] **Step 3: Controller** — `pipeline-stages.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PipelineStagesService } from './pipeline-stages.service';
import {
  CreatePipelineStageSchema,
  CreatePipelineStageDto,
} from './dto/create-pipeline-stage.dto';
import {
  UpdatePipelineStageSchema,
  UpdatePipelineStageDto,
} from './dto/update-pipeline-stage.dto';

const INTERNAL_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager', 'Interviewer'];

@Controller('company/pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly pipelineStagesService: PipelineStagesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...INTERNAL_ROLES)
  list() {
    return this.pipelineStagesService.list();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  create(
    @Body(new ZodValidationPipe(CreatePipelineStageSchema))
    dto: CreatePipelineStageDto,
  ) {
    return this.pipelineStagesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePipelineStageSchema))
    dto: UpdatePipelineStageDto,
  ) {
    return this.pipelineStagesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  remove(@Param('id') id: string) {
    return this.pipelineStagesService.remove(id);
  }
}
```

- [ ] **Step 4: Module** — `pipeline-stages.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { PipelineStagesController } from './pipeline-stages.controller';
import { PipelineStagesService } from './pipeline-stages.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule],
  controllers: [PipelineStagesController],
  providers: [PipelineStagesService],
})
export class PipelineStagesModule {}
```

- [ ] **Step 5: Unit tests** — `pipeline-stages.service.spec.ts`:

```ts
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
    pipelineStageRepo.create.mockResolvedValue({ id: 's3', name: 'New', order: 2 });
    await expect(service.create({ name: 'New' })).resolves.toEqual({
      id: 's3',
      name: 'New',
      order: 2,
    });
    expect(pipelineStageRepo.create).toHaveBeenCalledWith({ name: 'New', order: 2 });
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
    expect(pipelineStageRepo.update).toHaveBeenCalledWith('s1', { name: 'Screening' });
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
```

- [ ] **Step 6: Register module in `app.module.ts`** — add `PipelineStagesModule` to `imports`.

- [ ] **Step 7: Typecheck + tests + lint** — `cd backend && npm run typecheck && npm test && npm run lint`. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/pipeline-stages backend/src/app.module.ts
git commit -m "feat(m3): pipeline-stages CRUD module with reference-safe delete"
```

---

## Task 4: Frontend API clients, query keys, hooks

**Files:**
- Create: `frontend/src/api/applicationsApi.ts`
- Create: `frontend/src/api/pipelineStagesApi.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Create: `frontend/src/features/company/pipeline/hooks/usePipeline.ts`

**Interfaces:**
- Consumes: `apiClient` (`@/api/client`), `ApiEnvelope` (`@/hooks/useApiMutation`), `queryKeys`, `useApiMutation`.
- Produces (consumed by Task 5):
  - `Application` `{ id, candidateId, jobPostingId, currentStageId: string | null, matchScore: number | null, appliedAt: string, candidateName: string, candidateEmail: string | null, jobTitle: string, stageName: string | null, notes?: ApplicationNote[] }`; `ApplicationNote { id, applicationId, authorUserId, content, createdAt }`.
  - `PipelineStage` `{ id, name, order }`.
  - Query fns unwrap to `T`; mutation fns return full `ApiEnvelope<T>`.
  - Hooks: `useApplications(filters?)`, `useApplication(id)`, `useUpdateStage` (optimistic), `useNotes(appId)`, `useAddNote(appId)`, `usePipelineStages()`, `useCreateStage`, `useUpdateStageConfig`, `useDeleteStage`, `useReorderStages`.

- [ ] **Step 1: `api/applicationsApi.ts`**

```ts
import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface ApplicationNote {
  id: string;
  applicationId: string;
  authorUserId: string;
  content: string;
  createdAt: string;
}

export interface Application {
  id: string;
  candidateId: string;
  jobPostingId: string;
  currentStageId: string | null;
  matchScore: number | null;
  appliedAt: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  stageName: string | null;
  notes?: ApplicationNote[];
}

export interface ApplicationFilters {
  jobPostingId?: string;
  stageId?: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const applicationsApi = {
  list: async (filters?: ApplicationFilters): Promise<Application[]> => {
    const { data } = await apiClient.get('/applications', { params: filters });
    return unwrap(data as ApiEnvelope<Application[]>);
  },
  get: async (id: string): Promise<Application> => {
    const { data } = await apiClient.get(`/applications/${id}`);
    return unwrap(data as ApiEnvelope<Application>);
  },
  updateStage: async (
    applicationId: string,
    stageId: string,
  ): Promise<ApiEnvelope<Application>> => {
    const { data } = await apiClient.patch(`/applications/${applicationId}/stage`, {
      stageId,
    });
    return data as ApiEnvelope<Application>;
  },
  createNote: async (
    applicationId: string,
    content: string,
  ): Promise<ApiEnvelope<ApplicationNote>> => {
    const { data } = await apiClient.post(`/applications/${applicationId}/notes`, {
      content,
    });
    return data as ApiEnvelope<ApplicationNote>;
  },
  listNotes: async (applicationId: string): Promise<ApplicationNote[]> => {
    const { data } = await apiClient.get(`/applications/${applicationId}/notes`);
    return unwrap(data as ApiEnvelope<ApplicationNote[]>);
  },
};
```

- [ ] **Step 2: `api/pipelineStagesApi.ts`**

```ts
import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const pipelineStagesApi = {
  list: async (): Promise<PipelineStage[]> => {
    const { data } = await apiClient.get('/company/pipeline-stages');
    return unwrap(data as ApiEnvelope<PipelineStage[]>);
  },
  create: async (name: string): Promise<ApiEnvelope<PipelineStage>> => {
    const { data } = await apiClient.post('/company/pipeline-stages', { name });
    return data as ApiEnvelope<PipelineStage>;
  },
  update: async (
    id: string,
    input: { name?: string; order?: number },
  ): Promise<ApiEnvelope<PipelineStage>> => {
    const { data } = await apiClient.patch(`/company/pipeline-stages/${id}`, input);
    return data as ApiEnvelope<PipelineStage>;
  },
  remove: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/company/pipeline-stages/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
};
```

- [ ] **Step 3: Extend `queryKeys.ts`** — add to the `company` group:

```ts
applications: (filters?: { jobPostingId?: string; stageId?: string }) => [
  'company',
  'applications',
  filters,
],
application: (id: string) => ['company', 'applications', id],
notes: (applicationId: string) => ['company', 'applications', applicationId, 'notes'],
pipelineStages: () => ['company', 'pipeline-stages'],
```

- [ ] **Step 4: `features/company/pipeline/hooks/usePipeline.ts`**

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi, type Application } from '@/api/applicationsApi';
import { pipelineStagesApi } from '@/api/pipelineStagesApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export interface ApplicationFiltersInput {
  jobPostingId?: string;
  stageId?: string;
}

export function useApplications(filters?: ApplicationFiltersInput) {
  return useQuery({
    queryKey: queryKeys.company.applications(filters),
    queryFn: () => applicationsApi.list(filters),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: queryKeys.company.application(id),
    queryFn: () => applicationsApi.get(id),
    enabled: !!id,
  });
}

export function useUpdateStage() {
  const queryClient = useQueryClient();
  const key = queryKeys.company.applications();
  return useApiMutation<
    Application,
    { applicationId: string; stageId: string },
    { previous?: Application[] }
  >({
    mutationFn: ({ applicationId, stageId }) =>
      applicationsApi.updateStage(applicationId, stageId),
    silent: true,
    onMutate: async ({ applicationId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Application[]>(key);
      if (previous) {
        queryClient.setQueryData<Application[]>(
          key,
          previous.map((app) =>
            app.id === applicationId ? { ...app, currentStageId: stageId } : app,
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useNotes(applicationId: string) {
  return useQuery({
    queryKey: queryKeys.company.notes(applicationId),
    queryFn: () => applicationsApi.listNotes(applicationId),
    enabled: !!applicationId,
  });
}

export function useAddNote(applicationId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (content: string) =>
      applicationsApi.createNote(applicationId, content),
    successMessage: 'Note added',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.notes(applicationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.company.application(applicationId) });
    },
  });
}

export function usePipelineStages() {
  return useQuery({
    queryKey: queryKeys.company.pipelineStages(),
    queryFn: () => pipelineStagesApi.list(),
  });
}

export function useCreateStage() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (name: string) => pipelineStagesApi.create(name),
    successMessage: 'Stage created',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}

export function useUpdateStageConfig() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; order?: number };
    }) => pipelineStagesApi.update(id, input),
    successMessage: 'Stage updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: pipelineStagesApi.remove,
    successMessage: 'Stage deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}

export function useReorderStages() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (stages: { id: string; order: number }[]) =>
      Promise.all(stages.map(({ id, order }) => pipelineStagesApi.update(id, { order }))),
    silent: true,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}
```

- [ ] **Step 5: Typecheck + lint** — `cd frontend && npm run typecheck && npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api frontend/src/features/company/pipeline/hooks
git commit -m "feat(m3): applications and pipeline-stages API clients, query keys, hooks"
```

---

## Task 5: Frontend board components

**Files:**
- Create: `frontend/src/features/company/pipeline/PipelineBoard.tsx`
- Create: `frontend/src/features/company/pipeline/PipelineColumn.tsx`
- Create: `frontend/src/features/company/pipeline/ApplicationCard.tsx`
- Create: `frontend/src/features/company/pipeline/ApplicationDetailDrawer.tsx`
- Create: `frontend/src/features/company/pipeline/StageEditor.tsx`

**Interfaces:**
- Consumes: Task 4 hooks + api types; `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`; Mantine primitives; `useAuthStore` (role).
- Produces: the board + drawer + stage editor composed by the route in Task 6.

- [ ] **Step 1: `PipelineBoard.tsx`**

```tsx
import { useState } from 'react';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Group, Loader } from '@mantine/core';
import {
  useApplications,
  usePipelineStages,
  useUpdateStage,
} from './hooks/usePipeline';
import { PipelineColumn } from './PipelineColumn';
import { ApplicationDetailDrawer } from './ApplicationDetailDrawer';

export function PipelineBoard() {
  const { data: stages, isLoading: stagesLoading } = usePipelineStages();
  const { data: applications, isLoading: appsLoading } = useApplications();
  const updateStage = useUpdateStage();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const appId = String(active.id);
    const app = applications?.find((a) => a.id === appId);
    if (!app) return;
    const overApp = applications?.find((a) => a.id === String(over.id));
    const stageId = overApp ? overApp.currentStageId : String(over.id);
    if (!stageId || app.currentStageId === stageId) return;
    updateStage.mutate({ applicationId: appId, stageId });
  };

  if (stagesLoading || appsLoading) return <Loader />;

  const selected = applications?.find((a) => a.id === selectedId) ?? null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto' }}>
        {(stages ?? []).map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            applications={(applications ?? []).filter(
              (a) => a.currentStageId === stage.id,
            )}
            onSelect={setSelectedId}
          />
        ))}
      </Group>
      <ApplicationDetailDrawer application={selected} onClose={() => setSelectedId(null)} />
    </DndContext>
  );
}
```

- [ ] **Step 2: `PipelineColumn.tsx`**

```tsx
import { useDroppable } from '@dnd-kit/core';
import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { Application } from '@/api/applicationsApi';
import type { PipelineStage } from '@/api/pipelineStagesApi';
import { ApplicationCard } from './ApplicationCard';

interface Props {
  stage: PipelineStage;
  applications: Application[];
  onSelect: (id: string) => void;
}

export function PipelineColumn({ stage, applications, onSelect }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <Card
      ref={setNodeRef}
      w={280}
      withBorder
      style={{
        flexShrink: 0,
        backgroundColor: isOver ? 'var(--mantine-color-gray-0)' : undefined,
        transition: 'background-color 150ms ease',
      }}
    >
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {stage.name}
          </Text>
          <Badge size="sm" variant="light" color="gray">
            {applications.length}
          </Badge>
        </Group>
      </Card.Section>
      <Stack gap="xs" mt="xs">
        {applications.map((app) => (
          <ApplicationCard key={app.id} application={app} onClick={() => onSelect(app.id)} />
        ))}
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 3: `ApplicationCard.tsx`**

```tsx
import { useDraggable } from '@dnd-kit/core';
import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { Application } from '@/api/applicationsApi';

function matchColor(score: number | null): string {
  if (score === null) return 'gray';
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'yellow';
  return 'red';
}

export function ApplicationCard({
  application,
  onClick,
}: {
  application: Application;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: application.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.6 : 1,
        cursor: 'grab',
      }
    : { cursor: 'grab' };

  const score = application.matchScore;

  return (
    <Card ref={setNodeRef} style={style} withBorder onClick={onClick} {...attributes} {...listeners}>
      <Stack gap={2}>
        <Text size="sm" fw={600} lineClamp={1}>
          {application.candidateName}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={1}>
          {application.jobTitle}
        </Text>
        <Group justify="space-between" mt={4}>
          {score !== null && score !== undefined ? (
            <Badge size="xs" color={matchColor(score)} variant="light">
              {Math.round(score * 100)}%
            </Badge>
          ) : (
            <Badge size="xs" color="gray" variant="light">
              —
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            {new Date(application.appliedAt).toLocaleDateString()}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 4: `ApplicationDetailDrawer.tsx`** — Notes tab (list + add) and Interviews placeholder:

```tsx
import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Textarea,
} from '@mantine/core';
import dayjs from 'dayjs';
import type { Application } from '@/api/applicationsApi';
import { useAddNote, useNotes } from './hooks/usePipeline';

export function ApplicationDetailDrawer({
  application,
  onClose,
}: {
  application: Application | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const notesQuery = useNotes(application?.id ?? '');
  const addNote = useAddNote(application?.id ?? '');

  if (!application) return null;

  const notes = notesQuery.data ?? [];

  return (
    <Drawer
      opened={!!application}
      onClose={onClose}
      title={`${application.candidateName} — ${application.jobTitle}`}
      position="right"
      size="md"
    >
      <Stack gap="md">
        <Group>
          <Badge variant="light" color={application.stageName ? 'blue' : 'gray'}>
            {application.stageName ?? 'No stage'}
          </Badge>
          {application.matchScore !== null &&
          application.matchScore !== undefined ? (
            <Badge variant="light" color="teal">
              Match {Math.round(application.matchScore * 100)}%
            </Badge>
          ) : null}
        </Group>
        <Text size="sm" c="dimmed">
          Applied {application.appliedAt ? dayjs(application.appliedAt).format('MMM D, YYYY') : '—'}
        </Text>

        <Tabs defaultValue="notes">
          <Tabs.List>
            <Tabs.Tab value="notes">Notes</Tabs.Tab>
            <Tabs.Tab value="interviews">Interviews</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="notes" pt="md">
            <Stack gap="xs">
              {notesQuery.isLoading ? (
                <Loader size="sm" />
              ) : notes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No notes yet.
                </Text>
              ) : (
                notes.map((n) => (
                  <Box
                    key={n.id}
                    p="xs"
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 8,
                    }}
                  >
                    <Text size="sm">{n.content}</Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      {dayjs(n.createdAt).format('MMM D, YYYY h:mm A')}
                    </Text>
                  </Box>
                ))
              )}
              <Textarea
                placeholder="Add a note…"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                minRows={2}
              />
              <Button
                size="xs"
                disabled={note.trim().length === 0 || addNote.isPending}
                onClick={() => {
                  addNote.mutate(note.trim(), { onSuccess: () => setNote('') });
                }}
              >
                Add note
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="interviews" pt="md">
            <Text size="sm" c="dimmed">
              No interviews scheduled yet.
            </Text>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Drawer>
  );
}
```

- [ ] **Step 5: `StageEditor.tsx`** — dnd-kit sortable list, inline rename, add, delete:

```tsx
import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import type { PipelineStage } from '@/api/pipelineStagesApi';
import {
  useCreateStage,
  useDeleteStage,
  usePipelineStages,
  useReorderStages,
  useUpdateStageConfig,
} from './hooks/usePipeline';

function SortableStageRow({
  stage,
  onRename,
  onDelete,
}: {
  stage: PipelineStage;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: stage.id,
  });
  const [name, setName] = useState(stage.name);

  useEffect(() => setName(stage.name), [stage.name]);

  return (
    <Group
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      gap="xs"
      wrap="nowrap"
    >
      <ActionIcon variant="subtle" {...attributes} {...listeners}>
        <IconGripVertical size={16} />
      </ActionIcon>
      <TextInput
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => {
          if (name.trim() && name.trim() !== stage.name) onRename(name.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() && name.trim() !== stage.name) {
            onRename(name.trim());
          }
        }}
        flex={1}
      />
      <Tooltip label="Delete stage">
        <ActionIcon color="red" variant="subtle" onClick={onDelete}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function StageEditor() {
  const { data: stages, isLoading } = usePipelineStages();
  const createStage = useCreateStage();
  const updateStageConfig = useUpdateStageConfig();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();
  const [newName, setNewName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = stages ?? [];
    const oldIndex = current.findIndex((s) => s.id === active.id);
    const newIndex = current.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(current, oldIndex, newIndex).map((s, index) => ({
      ...s,
      order: index,
    }));
    reorderStages.mutate(reordered.map(({ id, order }) => ({ id, order })));
  };

  if (isLoading) return <Loader />;

  const handleAdd = () => {
    if (!newName.trim()) return;
    createStage.mutate(newName.trim(), { onSuccess: () => setNewName('') });
  };

  return (
    <Stack>
      <Title order={3}>Pipeline Stages</Title>
      <Text size="sm" c="dimmed">
        Drag to reorder. Deleting a stage with applications is blocked.
      </Text>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={(stages ?? []).map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <Stack gap="xs">
            {(stages ?? []).map((stage) => (
              <SortableStageRow
                key={stage.id}
                stage={stage}
                onRename={(name) =>
                  updateStageConfig.mutate({ id: stage.id, input: { name } })
                }
                onDelete={() => deleteStage.mutate(stage.id)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
      <Group>
        <TextInput
          placeholder="New stage name"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          flex={1}
        />
        <Button onClick={handleAdd} disabled={!newName.trim()}>
          Add stage
        </Button>
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 6: Typecheck + lint** — `cd frontend && npm run typecheck && npm run lint`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/company/pipeline
git commit -m "feat(m3): pipeline board, application drawer, stage editor"
```

---

## Task 6: Pipeline route + verify

**Files:**
- Create: `frontend/src/routes/company/pipeline.tsx`
- Modify: `frontend/src/routeTree.gen.ts` (regenerated via `npm run build`)

**Interfaces:**
- Consumes: `PipelineBoard`, `StageEditor`, `useAuthStore` (role), `useDisclosure` (`@mantine/hooks`).
- Produces: routable `/company/pipeline` page (parent `/company` already gated in `routes/company.tsx` `beforeLoad`).

- [ ] **Step 1: `routes/company/pipeline.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useDisclosure } from '@mantine/hooks';
import { Button, Group, Modal, Title } from '@mantine/core';
import { useAuthStore } from '../../api/useAuth';
import { PipelineBoard } from '../../features/company/pipeline/PipelineBoard';
import { StageEditor } from '../../features/company/pipeline/StageEditor';

export const Route = createFileRoute('/company/pipeline')({
  component: PipelinePage,
});

function PipelinePage() {
  const [opened, { open, close }] = useDisclosure(false);
  const role = useAuthStore((s) => s.role);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Pipeline</Title>
        {role === 'CompanyAdmin' && (
          <Button variant="outline" onClick={open}>
            Manage Stages
          </Button>
        )}
      </Group>
      <PipelineBoard />
      <Modal opened={opened} onClose={close} title="Manage Stages" size="md">
        <StageEditor />
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Build + typecheck + lint** — `cd frontend && npm run build && npm run typecheck && npm run lint`. Expected: build regenerates `routeTree.gen.ts`; all pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/company/pipeline.tsx frontend/src/routeTree.gen.ts
git commit -m "feat(m3): pipeline kanban route"
```

---

## Verification (manual, optional — requires docker + seeded DB)

1. Start stack: `docker compose up -d`; ensure backend on `:3000`, frontend on `:5173` (see `docs/00b_LOCAL_DEV_BOOTSTRAP.md`).
2. Seed data: `cd backend && npm run seed`.
3. Create an application to see on the board: sign in as `candidate@test.com` / `Candidate123!` on `/auth/signin`, browse jobs, apply. (Or sign in as `admin@acme.com` / `Admin123!` and create candidates; the candidate apply flow creates the application + first-stage assignment.)
4. As `admin@acme.com`: open `/company/pipeline` → cards appear grouped by stage. Drag a card to another column → PATCH fires, optimistic move, then server confirms.
5. Click a card → drawer shows candidate/job/match + Notes tab; add a note.
6. CompanyAdmin: "Manage Stages" → rename, add, drag-reorder, delete (delete blocked when stage has applications → toast error).
7. Backend spot checks:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"Admin123!"}')
# extract data.accessToken and use it as Bearer below
curl -X PATCH http://localhost:3000/api/applications/<id>/stage -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"stageId":"<uuid>"}'
curl -X POST http://localhost:3000/api/applications/<id>/notes -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"content":"Phone screen scheduled"}'
curl http://localhost:3000/api/company/pipeline-stages -H "Authorization: Bearer $TOKEN"
```
