## Task 2: Job postings module (backend)

**Files:**
- Create: `backend/src/modules/job-postings/dto/create-job-posting.dto.ts`
- Create: `backend/src/modules/job-postings/dto/update-job-posting.dto.ts`
- Create: `backend/src/modules/job-postings/job-postings.module.ts`
- Create: `backend/src/modules/job-postings/job-postings.service.ts`
- Create: `backend/src/modules/job-postings/job-postings.controller.ts`
- Create: `backend/src/modules/job-postings/job-postings.service.spec.ts`
- Modify: `backend/src/app.module.ts` (import `JobPostingsModule`)

**Interfaces:**
- Consumes: `JobPostingRepository`, `SkillRepository`, `TenantRepository`, `JobListingsIndexRepository` (from Task 1 + existing); `AuthCoreModule`, `RepositoriesModule`; `Roles`/`CurrentUser` decorators; `ZodValidationPipe`.
- Produces:
  - `JobPostingsService` — `list(status?: string)`; `getOne(id)` → `{ ...row, requiredSkillIds }` or `NotFoundException`; `create(user, dto)`; `update(id, dto)`; `publish(id)`; `close(id)`; `remove(id)`.
  - Endpoints (global prefix `api`):
    - `GET /job-postings?status=` — roles OA/R/HM
    - `POST /job-postings` — roles OA/R
    - `GET /job-postings/:id` — roles OA/R/HM
    - `PATCH /job-postings/:id` — roles OA/R
    - `POST /job-postings/:id/publish` — roles OA/R
    - `POST /job-postings/:id/close` — roles OA/R
    - `DELETE /job-postings/:id` — roles OA

- [ ] **Step 1: DTOs**

`create-job-posting.dto.ts`:
```ts
import { z } from 'zod';

export const CreateJobPostingSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  requiredSkillIds: z.array(z.string().uuid()).max(50).optional(),
});

export type CreateJobPostingDto = z.infer<typeof CreateJobPostingSchema>;
```

`update-job-posting.dto.ts`:
```ts
import { z } from 'zod';

export const UpdateJobPostingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).nullable().optional(),
  requiredSkillIds: z.array(z.string().uuid()).max(50).optional(),
});

export type UpdateJobPostingDto = z.infer<typeof UpdateJobPostingSchema>;
```

- [ ] **Step 2: Service** — `job-postings.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getTenantId, TenantContext } from '../../common/context/tenant-context';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';
import { CreateJobPostingDto } from './dto/create-job-posting.dto';
import { UpdateJobPostingDto } from './dto/update-job-posting.dto';

@Injectable()
export class JobPostingsService {
  constructor(
    private readonly jobPostingRepo: JobPostingRepository,
    private readonly skillRepo: SkillRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly jobListingsIndexRepo: JobListingsIndexRepository,
  ) {}

  list(status?: string) {
    return this.jobPostingRepo.findAll(status);
  }

  async getOne(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    const requiredSkillIds = await this.jobPostingRepo.getRequiredSkillIds(id);
    return { ...posting, requiredSkillIds };
  }

  async create(user: TenantContext, dto: CreateJobPostingDto) {
    if (dto.requiredSkillIds?.length) {
      await this.assertSkillsExist(dto.requiredSkillIds);
    }
    const posting = await this.jobPostingRepo.create({
      title: dto.title,
      description: dto.description,
      createdByUserId: user.userId,
    });
    if (dto.requiredSkillIds?.length) {
      await this.jobPostingRepo.setRequiredSkills(posting.id, dto.requiredSkillIds);
    }
    return this.getOne(posting.id);
  }

  async update(id: string, dto: UpdateJobPostingDto) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (dto.requiredSkillIds) {
      await this.assertSkillsExist(dto.requiredSkillIds);
    }
    const patch: Partial<{ title: string; description: string | null; status: string }> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (Object.keys(patch).length > 0) {
      await this.jobPostingRepo.update(id, patch);
    }
    if (dto.requiredSkillIds) {
      await this.jobPostingRepo.setRequiredSkills(id, dto.requiredSkillIds);
    }
    return this.getOne(id);
  }

  async publish(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (posting.status !== 'draft') {
      throw new ConflictException('Only draft postings can be published');
    }
    const updated = await this.jobPostingRepo.update(id, { status: 'open' });
    if (updated) await this.syncListing(updated);
    return this.getOne(id);
  }

  async close(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (posting.status === 'closed') return this.getOne(id);
    const updated = await this.jobPostingRepo.update(id, { status: 'closed' });
    if (updated) await this.syncListing(updated);
    return this.getOne(id);
  }

  async remove(id: string) {
    const posting = await this.jobPostingRepo.findById(id);
    if (!posting) throw new NotFoundException('Job posting not found');
    if (posting.status === 'open') {
      throw new ConflictException('Open postings must be closed before deletion');
    }
    const tenantId = getTenantId();
    await this.jobPostingRepo.delete(id);
    await this.jobListingsIndexRepo.delete(tenantId, id);
  }

  private async assertSkillsExist(skillIds: string[]) {
    const found = await this.skillRepo.findByIds(skillIds);
    if (found.length !== skillIds.length) {
      throw new NotFoundException('One or more skills do not exist');
    }
  }

  private async syncListing(posting: {
    id: string;
    title: string;
    description: string | null;
    status: string;
  }) {
    const tenantId = getTenantId();
    const tenant = await this.tenantRepo.findById(tenantId);
    await this.jobListingsIndexRepo.upsert({
      tenantId,
      jobPostingId: posting.id,
      title: posting.title,
      description: posting.description ?? '',
      companyName: tenant?.name ?? '',
      companySlug: tenant?.slug ?? '',
      status: posting.status,
    });
  }
}
```

- [ ] **Step 3: Controller** — `job-postings.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
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
import { TenantContext } from '../../common/context/tenant-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JobPostingsService } from './job-postings.service';
import {
  CreateJobPostingSchema,
  CreateJobPostingDto,
} from './dto/create-job-posting.dto';
import {
  UpdateJobPostingSchema,
  UpdateJobPostingDto,
} from './dto/update-job-posting.dto';

const VIEW_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];
const EDIT_ROLES = ['OrgAdmin', 'Recruiter'];

@Controller('job-postings')
export class JobPostingsController {
  constructor(private readonly jobPostingsService: JobPostingsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  list(@Query('status') status?: string) {
    return this.jobPostingsService.list(status);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  create(
    @Body(new ZodValidationPipe(CreateJobPostingSchema)) dto: CreateJobPostingDto,
    @CurrentUser() user: TenantContext,
  ) {
    return this.jobPostingsService.create(user, dto);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...VIEW_ROLES)
  getOne(@Param('id') id: string) {
    return this.jobPostingsService.getOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateJobPostingSchema)) dto: UpdateJobPostingDto,
  ) {
    return this.jobPostingsService.update(id, dto);
  }

  @Post(':id/publish')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  publish(@Param('id') id: string) {
    return this.jobPostingsService.publish(id);
  }

  @Post(':id/close')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...EDIT_ROLES)
  close(@Param('id') id: string) {
    return this.jobPostingsService.close(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  remove(@Param('id') id: string) {
    return this.jobPostingsService.remove(id);
  }
}
```

- [ ] **Step 4: Module** — `job-postings.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../../common/auth/auth-core.module';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { JobPostingsController } from './job-postings.controller';
import { JobPostingsService } from './job-postings.service';

@Module({
  imports: [AuthCoreModule, RepositoriesModule],
  controllers: [JobPostingsController],
  providers: [JobPostingsService],
})
export class JobPostingsModule {}
```

- [ ] **Step 5: Unit tests** — `job-postings.service.spec.ts` (mock all four repos; wrap `publish`/`close`/`remove` calls in `asyncStorage.run({ tenantId: 't1', userId: 'u1', role: 'OrgAdmin' }, ...)` so `getTenantId()` resolves):

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/tenant-context';
import { JobPostingsService } from './job-postings.service';
import { JobPostingRepository } from '../../repositories/job-posting.repository';
import { SkillRepository } from '../../repositories/skill.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { JobListingsIndexRepository } from '../../repositories/job-listings-index.repository';

const runInContext = <T>(fn: () => Promise<T>): Promise<T> =>
  asyncStorage.run(
    { tenantId: 't1', userId: 'u1', role: 'OrgAdmin' },
    fn,
  );

describe('JobPostingsService', () => {
  let service: JobPostingsService;
  const jobPostingRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setRequiredSkills: jest.fn(),
    getRequiredSkillIds: jest.fn(),
  };
  const skillRepo = { findByIds: jest.fn() };
  const tenantRepo = { findById: jest.fn() };
  const jobListingsIndexRepo = { upsert: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobPostingsService,
        { provide: JobPostingRepository, useValue: jobPostingRepo },
        { provide: SkillRepository, useValue: skillRepo },
        { provide: TenantRepository, useValue: tenantRepo },
        { provide: JobListingsIndexRepository, useValue: jobListingsIndexRepo },
      ],
    }).compile();
    service = module.get<JobPostingsService>(JobPostingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists postings via the repository', async () => {
    jobPostingRepo.findAll.mockResolvedValue([{ id: 'p1' }]);
    await expect(service.list('draft')).resolves.toEqual([{ id: 'p1' }]);
    expect(jobPostingRepo.findAll).toHaveBeenCalledWith('draft');
  });

  it('getOne throws NotFoundException when missing', async () => {
    jobPostingRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('nope')).rejects.toThrow(NotFoundException);
  });

  it('getOne returns the posting with required skill ids', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', title: 'Eng' });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['s1', 's2']);
    await expect(service.getOne('p1')).resolves.toEqual({
      id: 'p1',
      title: 'Eng',
      requiredSkillIds: ['s1', 's2'],
    });
  });

  it('create validates skills and writes required skills', async () => {
    skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
    jobPostingRepo.create.mockResolvedValue({ id: 'p1', title: 'Eng' });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue(['s1']);

    const result = await service.create(
      { tenantId: 't1', userId: 'u1', role: 'OrgAdmin' },
      { title: 'Eng', requiredSkillIds: ['s1'] },
    );

    expect(skillRepo.findByIds).toHaveBeenCalledWith(['s1']);
    expect(jobPostingRepo.create).toHaveBeenCalledWith({
      title: 'Eng',
      description: undefined,
      createdByUserId: 'u1',
    });
    expect(jobPostingRepo.setRequiredSkills).toHaveBeenCalledWith('p1', ['s1']);
    expect(result).toEqual({ id: 'p1', title: 'Eng', requiredSkillIds: ['s1'] });
  });

  it('create rejects unknown skill ids', async () => {
    skillRepo.findByIds.mockResolvedValue([{ id: 's1' }]);
    await expect(
      service.create(
        { tenantId: 't1', userId: 'u1', role: 'OrgAdmin' },
        { title: 'Eng', requiredSkillIds: ['s1', 'missing'] },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('publish only works on drafts and syncs the listing index', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'draft' });
    jobPostingRepo.update.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'open',
    });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
    tenantRepo.findById.mockResolvedValue({ id: 't1', name: 'Acme', slug: 'acme' });

    await expect(
      runInContext(() => service.publish('p1')),
    ).resolves.toEqual({ id: 'p1', requiredSkillIds: [] });

    expect(jobListingsIndexRepo.upsert).toHaveBeenCalledWith({
      tenantId: 't1',
      jobPostingId: 'p1',
      title: 'Eng',
      description: '',
      companyName: 'Acme',
      companySlug: 'acme',
      status: 'open',
    });
  });

  it('publish rejects non-draft postings', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'open' });
    await expect(
      runInContext(() => service.publish('p1')),
    ).rejects.toThrow(ConflictException);
  });

  it('close syncs the listing index with status closed', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'open' });
    jobPostingRepo.update.mockResolvedValue({
      id: 'p1',
      title: 'Eng',
      description: null,
      status: 'closed',
    });
    jobPostingRepo.getRequiredSkillIds.mockResolvedValue([]);
    tenantRepo.findById.mockResolvedValue({ id: 't1', name: 'Acme', slug: 'acme' });

    await runInContext(() => service.close('p1'));

    expect(jobListingsIndexRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed' }),
    );
  });

  it('remove blocks open postings and otherwise deletes listing + posting', async () => {
    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'open' });
    await expect(
      runInContext(() => service.remove('p1')),
    ).rejects.toThrow(ConflictException);

    jobPostingRepo.findById.mockResolvedValue({ id: 'p1', status: 'draft' });
    await runInContext(() => service.remove('p1'));
    expect(jobPostingRepo.delete).toHaveBeenCalledWith('p1');
    expect(jobListingsIndexRepo.delete).toHaveBeenCalledWith('t1', 'p1');
  });
});
```

- [ ] **Step 6: Register module in `app.module.ts`** — add `JobPostingsModule` to `imports` alongside `CandidateAccountModule`.

- [ ] **Step 7: Typecheck + tests** — `cd backend && npm run typecheck && npm test`. Expected: typecheck PASS; `job-postings.service.spec.ts` green, no other failures.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/job-postings backend/src/app.module.ts
git commit -m "feat(m2): job postings CRUD + publish/close with listings-index sync"
```

---


