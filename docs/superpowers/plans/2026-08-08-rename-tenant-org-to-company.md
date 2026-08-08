# Rename tenant/org → company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all "tenant" and "org" identifiers, routes, DB objects, and UI text to "company" across the full stack.

**Architecture:** Mechanical rename — one DB migration, systematic find-and-replace across ~70+ files. No logic changes, no new features.

**Tech Stack:** PostgreSQL (ALTER TABLE/SCHEMA), NestJS, Drizzle ORM, React, TanStack Router

## Global Constraints

- Existing migration SQL files under `backend/drizzle/*/migration.sql` are NOT modified
- Existing `snapshot.json` files are NOT modified (drizzle-kit managed)
- All renames are case-sensitive — `tenantId` → `companyId`, `TenantContext` → `CompanyContext`
- Role string `'OrgAdmin'` → `'CompanyAdmin'` (stored in DB, JWT, and code)
- Schema prefix `tenant_<uuid>` → `company_<uuid>`
- Cache key prefix `tenant:` → `company:`
- S3 path prefix `tenants/` → `companies/`
- API routes: clean break, no backward-compatible redirects

---

### Task 1: Database Migration

**Files:**
- Create: `backend/drizzle/20260808120000_rename_tenant_org_to_company/migration.sql`

**Purpose:** Rename the `tenants` table, `tenant_id` columns, indexes, PostgreSQL schemas, and migrate the `OrgAdmin` role to `CompanyAdmin`.

- [ ] **Step 1: Create migration directory**

```bash
mkdir -p backend/drizzle/20260808120000_rename_tenant_org_to_company
```

- [ ] **Step 2: Write the migration SQL**

Create `backend/drizzle/20260808120000_rename_tenant_org_to_company/migration.sql`:

```sql
-- Rename Tenant/Org → Company Migration
-- Renames: tenants→companies, tenant_id→company_id, tenant_<uuid>→company_<uuid>, OrgAdmin→CompanyAdmin

-- 1. Rename table
ALTER TABLE "public"."tenants" RENAME TO "companies";

-- 2. Rename columns on public-schema tables
ALTER TABLE "public"."user_emails" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."refresh_tokens" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."audit_logs" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."candidate_bookmarks" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."candidate_applications_index" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."job_listings_index" RENAME COLUMN "tenant_id" TO "company_id";

-- 3. Rename indexes
ALTER INDEX "public"."idx_audit_logs_tenant_action" RENAME TO "idx_audit_logs_company_action";
ALTER INDEX "public"."idx_candidate_bookmarks_tenant_job" RENAME TO "idx_candidate_bookmarks_company_job";
ALTER INDEX "public"."idx_candidate_applications_tenant_job" RENAME TO "idx_candidate_applications_company_job";
ALTER INDEX "public"."idx_job_listings_tenant" RENAME TO "idx_job_listings_company";

-- 4. Rename PostgreSQL schemas (tenant_<uuid> → company_<uuid>)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'
  LOOP
    EXECUTE 'ALTER SCHEMA "' || r.nspname || '" RENAME TO "company_' || substring(r.nspname FROM 8) || '"';
  END LOOP;
END $$;

-- 5. Migrate OrgAdmin → CompanyAdmin role
ALTER TABLE "public"."companies" ALTER COLUMN "status" SET DEFAULT 'active';
UPDATE "public"."users" SET "role" = 'CompanyAdmin' WHERE "role" = 'OrgAdmin';
-- Note: the users table lives in per-company schemas, so we need to update across all of them
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'company_%'
  LOOP
    EXECUTE 'UPDATE "' || r.nspname || '"."users" SET "role" = ''CompanyAdmin'' WHERE "role" = ''OrgAdmin''';
    EXECUTE 'ALTER TABLE "' || r.nspname || '"."users" ALTER COLUMN "role" SET DEFAULT ''CompanyAdmin''';
  END LOOP;
END $$;
```

- [ ] **Step 3: Verify migration on local DB**

```bash
docker compose up -d
# Apply all prior migrations first (if fresh DB), then:
psql -h localhost -U devuser -d talentpipe -f backend/drizzle/20260808120000_rename_tenant_org_to_company/migration.sql
```

Expected: No errors. Verify with:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'companies';
SELECT column_name FROM information_schema.columns WHERE column_name = 'company_id' AND table_schema = 'public';
SELECT nspname FROM pg_namespace WHERE nspname LIKE 'company_%';
```

---

### Task 2: Update Drizzle Schema Definitions

**Files:**
- Modify: `backend/src/database/schema.ts`

**Purpose:** Update all table/column definitions to match the new DB names.

- [ ] **Step 1: Update `schema.ts`**

Key renames in `backend/src/database/schema.ts`:

| Line area | From | To |
|-----------|------|-----|
| Table export | `pgTable('tenants', ...)` | `pgTable('companies', ...)` |
| Table name in code | `tenants` (export const) | `companies` |
| Columns | `tenantId: varchar('tenant_id'...)` / `uuid('tenant_id'...)` | `companyId: varchar('company_id'...)` / `uuid('company_id'...)` |
| Index names | `idx_audit_logs_tenant_action` | `idx_audit_logs_company_action` |
| Index names | `idx_candidate_bookmarks_tenant_job` | `idx_candidate_bookmarks_company_job` |
| Index names | `idx_candidate_applications_tenant_job` | `idx_candidate_applications_company_job` |
| Index names | `idx_job_listings_tenant` | `idx_job_listings_company` |
| Default role | `.default('OrgAdmin')` | `.default('CompanyAdmin')` |

- [ ] **Step 2: Verify schema compiles**

```bash
cd backend && npm run typecheck
```

Expected: No errors related to schema changes (other errors from un-updated files are expected at this point).

---

### Task 3: Rename Backend Context & Repository Files

**Files:**
- Rename: `backend/src/common/context/tenant-context.ts` → `company-context.ts`
- Rename: `backend/src/common/interceptors/tenant-context.interceptor.ts` → `company-context.interceptor.ts`
- Rename: `backend/src/repositories/tenant.repository.ts` → `company.repository.ts`
- Rename: `backend/src/modules/auth/services/tenant-provisioning.service.ts` → `company-provisioning.service.ts`
- Rename: `backend/src/modules/auth/services/tenant-provisioning.service.spec.ts` → `company-provisioning.service.spec.ts`
- Rename: `backend/src/modules/auth/dto/org-signup.dto.ts` → `company-signup.dto.ts`
- Rename: `backend/src/modules/platform/dto/create-tenant-user.dto.ts` → `create-company-user.dto.ts`
- Rename: `backend/src/modules/platform/dto/update-tenant-user.dto.ts` → `update-company-user.dto.ts`

**Purpose:** Rename the core infrastructure files before updating their contents.

- [ ] **Step 1: Rename all files listed above**

Use `mv` or `git mv` for each file.

- [ ] **Step 2: Verify files exist at new paths**

```bash
ls backend/src/common/context/company-context.ts
ls backend/src/common/interceptors/company-context.interceptor.ts
ls backend/src/repositories/company.repository.ts
ls backend/src/modules/auth/services/company-provisioning.service.ts
ls backend/src/modules/auth/dto/company-signup.dto.ts
ls backend/src/modules/platform/dto/create-company-user.dto.ts
ls backend/src/modules/platform/dto/update-company-user.dto.ts
```

---

### Task 4: Update Backend Context & Repository Contents

**Files:**
- Modify: `backend/src/common/context/company-context.ts`
- Modify: `backend/src/common/interceptors/company-context.interceptor.ts`
- Modify: `backend/src/repositories/company.repository.ts`
- Modify: `backend/src/database/drizzle-schema.service.ts`
- Modify: `backend/src/modules/auth/services/company-provisioning.service.ts`
- Modify: `backend/src/modules/auth/services/company-provisioning.service.spec.ts`
- Modify: `backend/src/modules/auth/dto/company-signup.dto.ts`
- Modify: `backend/src/modules/platform/dto/create-company-user.dto.ts`
- Modify: `backend/src/modules/platform/dto/update-company-user.dto.ts`

**Purpose:** Update all identifiers inside the renamed files.

- [ ] **Step 1: Update `company-context.ts`**

| From | To |
|------|-----|
| `TenantContext` (interface) | `CompanyContext` |
| `tenantId` (property/param) | `companyId` |
| `getTenantId()` | `getCompanyId()` |
| `tenant_${tenantId}` | `company_${companyId}` |

- [ ] **Step 2: Update `company-context.interceptor.ts`**

| From | To |
|------|-----|
| `TenantContextInterceptor` (class) | `CompanyContextInterceptor` |
| Import from `./tenant-context` | Import from `./company-context` |
| `tenantId` variable | `companyId` |

- [ ] **Step 3: Update `company.repository.ts`**

| From | To |
|------|-----|
| `TenantRepository` (class) | `CompanyRepository` |
| `provisionSchema` with `tenant_` prefix | `company_` prefix |
| `TENANT_TABLES` | `COMPANY_TABLES` |
| All `tenant` references | `company` |

- [ ] **Step 4: Update `drizzle-schema.service.ts`**

| From | To |
|------|-----|
| `forCurrentTenant()` | `forCurrentCompany()` |
| `getTenantId()` import | `getCompanyId()` import |
| `tenant_${tenantId}` | `company_${companyId}` |

- [ ] **Step 5: Update `company-provisioning.service.ts` and its spec**

| From | To |
|------|-----|
| `TenantProvisioningService` | `CompanyProvisioningService` |
| `CreateTenantDto` | `CreateCompanyDto` |
| `createTenant()` | `createCompany()` |
| `tenant_${id}` | `company_${id}` |
| `role: 'OrgAdmin'` | `role: 'CompanyAdmin'` |

- [ ] **Step 6: Update `company-signup.dto.ts`**

| From | To |
|------|-----|
| `OrgSignupSchema` | `CompanySignupSchema` |
| `OrgSignupDto` | `CompanySignupDto` |

- [ ] **Step 7: Update `create-company-user.dto.ts` and `update-company-user.dto.ts`**

| From | To |
|------|-----|
| `CreateTenantUserSchema` / `CreateTenantUserDto` | `CreateCompanyUserSchema` / `CreateCompanyUserDto` |
| `UpdateTenantUserSchema` / `UpdateTenantUserDto` | `UpdateCompanyUserSchema` / `UpdateCompanyUserDto` |
| Import from `../../org/dto/invite-user.dto` | Import from `../../company/dto/invite-user.dto` |

---

### Task 5: Rename & Update Org Module → Company Module

**Files:**
- Rename directory: `backend/src/modules/org/` → `backend/src/modules/company/`
- Rename all files inside: `org.*.ts` → `company.*.ts`

**Purpose:** Rename the entire org module to company module.

- [ ] **Step 1: Rename directory and files**

```bash
mv backend/src/modules/org backend/src/modules/company
cd backend/src/modules/company
mv org.module.ts company.module.ts
mv org.controller.ts company.controller.ts
mv org.service.ts company.service.ts
mv org-users.controller.ts company-users.controller.ts
mv org-users.service.ts company-users.service.ts
mv org-users.service.spec.ts company-users.service.spec.ts
mv dto/update-org.dto.ts dto/update-company.dto.ts
```

- [ ] **Step 2: Update all identifiers inside these files**

| From | To |
|------|-----|
| `OrgModule` | `CompanyModule` |
| `OrgController` | `CompanyController` |
| `OrgService` | `CompanyService` |
| `OrgUsersController` | `CompanyUsersController` |
| `OrgUsersService` | `CompanyUsersService` |
| `UpdateOrgSchema` / `UpdateOrgDto` | `UpdateCompanySchema` / `UpdateCompanyDto` |
| `ensureOrgAdminRemains()` | `ensureCompanyAdminRemains()` |
| `@Roles('OrgAdmin')` | `@Roles('CompanyAdmin')` |
| `'OrgAdmin'` in role arrays | `'CompanyAdmin'` |
| Route prefix `/org` | `/company` |
| `orgOwner` variable | `companyOwner` |
| All imports from sibling files | Update to new filenames |

- [ ] **Step 3: Update `backend/src/app.module.ts`**

| From | To |
|------|-----|
| `import { OrgModule } from './modules/org/org.module'` | `import { CompanyModule } from './modules/company/company.module'` |
| `OrgModule` in imports array | `CompanyModule` |

---

### Task 6: Update Remaining Backend References

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.spec.ts`
- Modify: `backend/src/modules/auth/auth.service.spec.ts`
- Modify: `backend/src/modules/platform/platform.controller.ts`
- Modify: `backend/src/modules/platform/platform.service.ts`
- Modify: `backend/src/modules/platform/platform-accounts.controller.ts`
- Modify: `backend/src/modules/platform/platform-accounts.service.ts`
- Modify: `backend/src/modules/platform/platform-data.service.ts`
- Modify: `backend/src/modules/platform/platform-data.controller.ts`
- Modify: `backend/src/modules/public-careers/public-careers.controller.ts`
- Modify: `backend/src/modules/public-careers/public-careers.service.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.controller.ts`
- Modify: `backend/src/modules/candidate-account/candidate-account.service.ts`
- Modify: `backend/src/modules/dashboard/dashboard.controller.ts`
- Modify: `backend/src/modules/dashboard/dashboard.service.spec.ts`
- Modify: `backend/src/modules/candidates/candidates.controller.ts`
- Modify: `backend/src/modules/job-postings/job-postings.controller.ts`
- Modify: `backend/src/modules/interviews/interviews.controller.ts`
- Modify: `backend/src/modules/resumes/resumes.controller.ts`
- Modify: `backend/src/modules/applications/applications.controller.ts`
- Modify: `backend/src/modules/pipeline-stages/pipeline-stages.controller.ts`
- Modify: `backend/src/common/cache/cache.service.ts`
- Modify: `backend/src/common/cache/cache.constants.ts`
- Modify: `backend/src/common/auth/jwt.strategy.ts`
- Modify: `backend/src/common/audit/audit.service.ts`
- Modify: `backend/src/common/guards/roles.guard.spec.ts`
- Modify: `backend/src/queues/queues.ts`
- Modify: `backend/src/main.ts` (if tenant references exist)
- Modify: `backend/scripts/seed.ts`

**Purpose:** Update all remaining backend files with the rename mappings.

- [ ] **Step 1: Global search-and-replace across all listed files**

Apply these substitutions in order (most specific first):

1. `'OrgAdmin'` → `'CompanyAdmin'` (role string)
2. `OrgSignup` → `CompanySignup` (DTO/method names)
3. `orgSignup` → `companySignup`
4. `orgOwner` → `companyOwner`
5. `TenantContext` → `CompanyContext`
6. `TenantContextInterceptor` → `CompanyContextInterceptor`
7. `TenantRepository` → `CompanyRepository`
8. `TenantProvisioningService` → `CompanyProvisioningService`
9. `CreateTenantUser` → `CreateCompanyUser`
10. `UpdateTenantUser` → `UpdateCompanyUser`
11. `forCurrentTenant` → `forCurrentCompany`
12. `getTenantId` → `getCompanyId`
13. `invalidateTenantDashboard` → `invalidateCompanyDashboard`
14. `getTenantDashboardGeneration` → `getCompanyDashboardGeneration`
15. `setTenantDashboardIfGeneration` → `setCompanyDashboardIfGeneration`
16. `dashboardSummaryKey` — update prefix `tenant:` → `company:`
17. `dashboardGenerationKey` — update prefix `tenant:` → `company:`
18. `listTenants` → `listCompanies`
19. `getTenant(` → `getCompany(`  (careful — don't match `getTenantId`)
20. `setTenantStatus` → `setCompanyStatus`
21. `createTenant` → `createCompany`
22. `listTenantUsers` → `listCompanyUsers`
23. `createTenantUser` → `createCompanyUser`
24. `updateTenantUser` → `updateCompanyUser`
25. `setTenantUserStatus` → `setCompanyUserStatus`
26. `removeTenantUser` → `removeCompanyUser`
27. `listTenantStages` → `listCompanyStages`
28. `requireTenant` → `requireCompany`
29. `requireActiveTenant` → `requireActiveCompany`
30. `requireOpenTenantJob` → `requireOpenCompanyJob`
31. `findOpenByTenant` → `findOpenByCompany`
32. `NIL_TENANT_ID` → `NIL_COMPANY_ID`
33. `TENANT_TABLES` → `COMPANY_TABLES`
34. `tenantId` → `companyId` (variable/param names — do this LAST to avoid partial matches)
35. `tenantSlug` → `companySlug`
36. `tenant_` (in schema prefix strings) → `company_`
37. `tenants/` (in S3 path strings) → `companies/`
38. Route paths: `/org/` → `/company/`, `/platform/tenants` → `/platform/companies`
39. Import paths: `from '.../org/` → `from '.../company/`, `from '.../tenant-` → `from '.../company-`

- [ ] **Step 2: Update all import paths**

Every file that imports from renamed files needs its import path updated:
- `from '.../tenant-context'` → `from '.../company-context'`
- `from '.../tenant-context.interceptor'` → `from '.../company-context.interceptor'`
- `from '.../tenant.repository'` → `from '.../company.repository'`
- `from '.../tenant-provisioning.service'` → `from '.../company-provisioning.service'`
- `from '.../org-signup.dto'` → `from '.../company-signup.dto'`
- `from '.../create-tenant-user.dto'` → `from '.../create-company-user.dto'`
- `from '.../update-tenant-user.dto'` → `from '.../update-company-user.dto'`
- `from '.../org/org.module'` → `from '.../company/company.module'`
- `from '.../org/org.controller'` → `from '.../company/company.controller'`
- `from '.../org/org.service'` → `from '.../company/company.service'`
- `from '.../org/org-users.controller'` → `from '.../company/company-users.controller'`
- `from '.../org/org-users.service'` → `from '.../company/company-users.service'`
- `from '.../org/dto/invite-user.dto'` → `from '.../company/dto/invite-user.dto'`
- `from '.../org/dto/update-org.dto'` → `from '.../company/dto/update-company.dto'`

- [ ] **Step 3: Verify backend compiles**

```bash
cd backend && npm run typecheck
```

Expected: No type errors.

---

### Task 7: Rename Frontend Directories & Files

**Files:**
- Rename directory: `frontend/src/features/org/` → `frontend/src/features/company/`
- Rename directory: `frontend/src/routes/org/` → `frontend/src/routes/company/`
- Rename directory: `frontend/src/routes/auth/org/` → `frontend/src/routes/auth/company/`
- Rename: `frontend/src/features/admin/TenantsPage.tsx` → `CompaniesPage.tsx`
- Rename: `frontend/src/features/admin/TenantDetailPage.tsx` → `CompanyDetailPage.tsx`
- Rename: `frontend/src/features/auth/OrgSignupPage.tsx` → `CompanySignupPage.tsx`
- Rename: `frontend/src/routes/admin/tenants.tsx` → `companies.tsx`
- Rename: `frontend/src/routes/admin/tenants.$tenantId.tsx` → `companies.$companyId.tsx`
- Rename: `frontend/src/routes/org.tsx` → `company.tsx`
- Rename: `frontend/src/api/orgApi.ts` → `companyApi.ts`
- Rename: `frontend/src/api/orgUsersApi.ts` → `companyUsersApi.ts`
- Rename: `frontend/src/hooks/auth/useOrgSignup.ts` → `useCompanySignup.ts`

**Purpose:** Rename all frontend files and directories.

- [ ] **Step 1: Rename directories**

```bash
mv frontend/src/features/org frontend/src/features/company
mv frontend/src/routes/org frontend/src/routes/company
mv frontend/src/routes/auth/org frontend/src/routes/auth/company
```

- [ ] **Step 2: Rename individual files**

```bash
mv frontend/src/features/admin/TenantsPage.tsx frontend/src/features/admin/CompaniesPage.tsx
mv frontend/src/features/admin/TenantDetailPage.tsx frontend/src/features/admin/CompanyDetailPage.tsx
mv frontend/src/features/auth/OrgSignupPage.tsx frontend/src/features/auth/CompanySignupPage.tsx
mv frontend/src/routes/admin/tenants.tsx frontend/src/routes/admin/companies.tsx
mv frontend/src/routes/admin/tenants.\$tenantId.tsx frontend/src/routes/admin/companies.\$companyId.tsx
mv frontend/src/routes/org.tsx frontend/src/routes/company.tsx
mv frontend/src/api/orgApi.ts frontend/src/api/companyApi.ts
mv frontend/src/api/orgUsersApi.ts frontend/src/api/companyUsersApi.ts
mv frontend/src/hooks/auth/useOrgSignup.ts frontend/src/hooks/auth/useCompanySignup.ts
```

- [ ] **Step 3: Rename files inside moved directories**

```bash
# features/company/ internal renames
mv frontend/src/features/company/dashboard/OrgDashboardPage.tsx CompanyDashboardPage.tsx
mv frontend/src/features/company/settings/OrgSettingsPage.tsx CompanySettingsPage.tsx
mv frontend/src/features/company/settings/hooks/useOrgSettings.ts useCompanySettings.ts
mv frontend/src/features/company/users/hooks/useOrgUsers.ts useCompanyUsers.ts

# routes/company/ internal renames
mv frontend/src/routes/company/dashboard.tsx # already correct name
mv frontend/src/routes/company/settings.tsx # already correct name
mv frontend/src/routes/company/users.tsx # already correct name
mv frontend/src/routes/auth/company/signup.tsx # already correct name
```

---

### Task 8: Update Frontend References

**Files:**
- Modify: All files in `frontend/src/features/company/` (entire tree)
- Modify: All files in `frontend/src/routes/company/` (entire tree)
- Modify: All files in `frontend/src/routes/auth/company/`
- Modify: `frontend/src/features/admin/CompaniesPage.tsx`
- Modify: `frontend/src/features/admin/CompanyDetailPage.tsx`
- Modify: `frontend/src/features/auth/CompanySignupPage.tsx`
- Modify: `frontend/src/routes/admin/companies.tsx`
- Modify: `frontend/src/routes/admin/companies.$companyId.tsx`
- Modify: `frontend/src/routes/company.tsx`
- Modify: `frontend/src/routes/index.tsx`
- Modify: `frontend/src/routes/_candidate.tsx`
- Modify: `frontend/src/routes/admin.tsx`
- Modify: `frontend/src/routes/auth/signin.tsx`
- Modify: `frontend/src/api/companyApi.ts`
- Modify: `frontend/src/api/companyUsersApi.ts`
- Modify: `frontend/src/api/authApi.ts`
- Modify: `frontend/src/api/pipelineStagesApi.ts`
- Modify: `frontend/src/api/queryKeys.ts`
- Modify: `frontend/src/api/useAuth.ts`
- Modify: `frontend/src/hooks/auth/useCompanySignup.ts`
- Modify: `frontend/src/hooks/auth/index.ts`
- Modify: `frontend/src/features/candidate-portal/types/index.ts`
- Modify: `frontend/src/features/candidate-portal/api/candidateApi.ts`
- Modify: `frontend/src/features/candidate-portal/hooks/useJobDetail.ts`
- Modify: `frontend/src/features/candidate-portal/hooks/useApply.ts`
- Modify: `frontend/src/features/candidate-portal/hooks/useAddBookmark.ts`
- Modify: `frontend/src/features/candidate-portal/applications/CandidateApplyModal.tsx`
- Modify: `frontend/src/features/candidate-portal/applications/ApplicationsPage.tsx`
- Modify: `frontend/src/features/candidate-portal/dashboard/JobSearchPage.tsx`
- Modify: `frontend/src/features/public-careers/JobListingPage.tsx`
- Modify: `frontend/src/features/public-careers/JobDetailPage.tsx`

**Purpose:** Update all identifiers, imports, routes, and types across the frontend.

- [ ] **Step 1: Apply global substitutions across all listed files**

| From | To |
|------|-----|
| `'OrgAdmin'` | `'CompanyAdmin'` |
| `OrgPlatform` | `CompanyPlatform` |
| `OrgDashboardPage` | `CompanyDashboardPage` |
| `OrgSettingsPage` | `CompanySettingsPage` |
| `OrgSignupPage` | `CompanySignupPage` |
| `TenantsPage` | `CompaniesPage` |
| `TenantDetailPage` | `CompanyDetailPage` |
| `PlatformTenant` | `PlatformCompany` |
| `TenantDetail` | `CompanyDetail` |
| `OrgSettings` | `CompanySettings` |
| `OrgUser` | `CompanyUser` |
| `usePlatformTenants` | `usePlatformCompanies` |
| `useTenantDetail` | `useCompanyDetail` |
| `useSetTenantStatus` | `useSetCompanyStatus` |
| `useTenantUsers` | `useCompanyUsers` |
| `useCreateTenantUser` | `useCreateCompanyUser` |
| `useUpdateTenantUser` | `useUpdateCompanyUser` |
| `useSetTenantUserStatus` | `useSetCompanyUserStatus` |
| `useRemoveTenantUser` | `useRemoveCompanyUser` |
| `useOrgSettings` | `useCompanySettings` |
| `useUpdateOrgSettings` | `useUpdateCompanySettings` |
| `useOrgUsers` | `useCompanyUsers` |
| `useOrgSignup` | `useCompanySignup` |
| `orgApi` | `companyApi` |
| `orgUsersApi` | `companyUsersApi` |
| `authApi.orgSignup` | `authApi.companySignup` |
| `queryKeys.org` | `queryKeys.company` |
| `queryKeys.platform.tenants` | `queryKeys.platform.companies` |
| `queryKeys.platform.tenant(` | `queryKeys.platform.company(` |
| `queryKeys.platform.tenantUsers` | `queryKeys.platform.companyUsers` |
| `queryKeys.platform.tenantStages` | `queryKeys.platform.companyStages` |
| `queryKeys.candidate.jobDetail(tenantId` | `queryKeys.candidate.jobDetail(companyId` |
| `queryKeys.publicCareers.jobs(tenantSlug` | `queryKeys.publicCareers.jobs(companySlug` |
| `queryKeys.publicCareers.job(tenantSlug` | `queryKeys.publicCareers.job(companySlug` |
| `tenantId` (variable/prop names) | `companyId` |
| `tenantSlug` | `companySlug` |
| `'/org/dashboard'` | `'/company/dashboard'` |
| `'/org/` | `'/company/` |
| `'/admin/tenants'` | `'/admin/companies'` |
| `'/admin/tenants/$` | `'/admin/companies/$` |
| `'/auth/org/signup'` | `'/auth/company/signup'` |
| `'/careers/$tenantSlug/` | `'/careers/$companySlug/` |
| Route definitions: `createFileRoute('/org/` | `createFileRoute('/company/` |
| Route definitions: `createFileRoute('/admin/tenants'` | `createFileRoute('/admin/companies'` |
| Import paths: `from '.../org/` | `from '.../company/` |
| Import paths: `from '.../orgApi'` | `from '.../companyApi'` |
| Import paths: `from '.../orgUsersApi'` | `from '.../companyUsersApi'` |
| Import paths: `from '.../useOrgSignup'` | `from '.../useCompanySignup'` |
| Import paths: `from '.../TenantsPage'` | `from '.../CompaniesPage'` |
| Import paths: `from '.../TenantDetailPage'` | `from '.../CompanyDetailPage'` |
| `localStorage.getItem('tenantId')` | `localStorage.getItem('companyId')` |
| `localStorage.setItem('tenantId'` | `localStorage.setItem('companyId'` |
| `localStorage.removeItem('tenantId')` | `localStorage.removeItem('companyId')` |
| `AuthState.tenantId` | `AuthState.companyId` |

- [ ] **Step 2: Delete and regenerate route tree**

```bash
rm frontend/src/routeTree.gen.ts
cd frontend && npm run dev
# Route tree auto-regenerates on first run
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd frontend && npm run build
```

Expected: No type errors.

---

### Task 9: Update Tests

**Files:**
- Modify: `backend/test/phase5b-phase6.e2e-spec.ts`
- Modify: `backend/test/phase7.e2e-spec.ts`
- Modify: `backend/test/phase8.e2e-spec.ts`
- Modify: `backend/test/phase9.e2e-spec.ts`
- Modify: `backend/test/phase11.e2e-spec.ts`
- Modify: `backend/src/modules/auth/auth.controller.spec.ts`
- Modify: `backend/src/modules/auth/auth.service.spec.ts`
- Modify: `backend/src/modules/auth/services/company-provisioning.service.spec.ts`
- Modify: `backend/src/modules/org/org-users.service.spec.ts` (now at `company/company-users.service.spec.ts`)
- Modify: `backend/src/modules/dashboard/dashboard.service.spec.ts`
- Modify: `backend/src/common/guards/roles.guard.spec.ts`

**Purpose:** Update all test files with new identifiers, routes, and role strings.

- [ ] **Step 1: Apply same substitutions as Task 6 to all test files**

Plus test-specific renames:

| From | To |
|------|-----|
| `TenantAccount` (type in e2e) | `CompanyAccount` |
| `createTenant(` (e2e helper) | `createCompany(` |
| `createTenantUser(` (e2e helper) | `createCompanyUser(` |
| `runInTenant(` | `runInCompany(` |
| `createdTenantIds` | `createdCompanyIds` |
| `/api/auth/org/signup` | `/api/auth/company/signup` |
| `/api/org/` | `/api/company/` |
| `/api/platform/tenants` | `/api/platform/companies` |
| `tenant_${` (in cleanup SQL) | `company_${` |
| `DROP SCHEMA IF EXISTS "tenant_` | `DROP SCHEMA IF EXISTS "company_` |
| `describe('org settings'` | `describe('company settings'` |
| `orgFeedback` | `companyFeedback` |
| `orgWithdraw` | `companyWithdraw` |

- [ ] **Step 2: Run unit tests**

```bash
cd backend && npm test
```

- [ ] **Step 3: Run e2e tests**

```bash
cd backend && npm run test:e2e
```

---

### Task 10: Update Documentation & Config

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/00_PROJECT_INSTRUCTIONS.md`
- Modify: `docs/00b_LOCAL_DEV_BOOTSTRAP.md`
- Modify: `docs/01_TALENTPIPE_PRD_SRS.md`
- Modify: `docs/02_TECHNICAL_OVERVIEW.md`
- Modify: `docs/03_RECRUITMENT_ATS_ARCHITECTURE.md`
- Modify: `docs/04_ERD_DIAGRAM.md`
- Modify: `docs/05_DATA_ISOLATION_STRATEGY.md`
- Modify: `docs/06_ROLE_INTERACTIONS.md`
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md`
- Modify: `docs/08_FRONTEND_COMPONENT_STRUCTURE.md`
- Modify: `docs/09_IMPLEMENTATION_GUIDE.md`
- Modify: `docs/DATA_MODEL_DEFINITION.md`
- Modify: `.opencode/agents/talentpipe-planning.md`
- Modify: `.opencode/agents/talentpipe-debugger.md`
- Modify: `docs/talentpipe-postman.json`
- Modify: `backend/requests/http-client.env.json`
- Modify: `backend/requests/http-client.private.env.json`
- Modify: `backend/requests/auth.http`

**Purpose:** Update all documentation and config files with new terminology.

- [ ] **Step 1: Apply global substitutions to all markdown docs**

Same substitutions as Tasks 6/8, plus doc-specific:
- "Multi-Tenant ATS" → "Multi-Company ATS" (or just "ATS" — context-dependent)
- "schema-per-tenant" → "schema-per-company"
- "tenant data" → "company data"
- "tenant careers" → "company careers"
- "tenant dashboard" → "company dashboard"
- "tenant settings" → "company settings"
- "tenant slug" → "company slug"
- "cross-tenant" → "cross-company"
- "per-tenant" → "per-company"
- "OrgAdmin" → "CompanyAdmin"
- "OrgModule" → "CompanyModule"
- "OrgController" → "CompanyController"
- "OrgService" → "CompanyService"
- "OrgUsersController" → "CompanyUsersController"
- "OrgUsersService" → "CompanyUsersService"
- "/org/*" → "/company/*"
- "/auth/org/signup" → "/auth/company/signup"
- "/platform/tenants" → "/platform/companies"
- "TenantContextInterceptor" → "CompanyContextInterceptor"
- "TenantProvisioningService" → "CompanyProvisioningService"
- "forCurrentTenant()" → "forCurrentCompany()"
- "getTenantId()" → "getCompanyId()"
- "tenant_" (schema prefix) → "company_"
- Redis keys "tenant:" → "company:"
- S3 paths "tenants/" → "companies/"

- [ ] **Step 2: Update Postman collection**

In `docs/talentpipe-postman.json`:
- `"tenantId"` variable → `"companyId"`
- `orgEmail` → `companyEmail`
- `orgPassword` → `companyPassword`
- All URL paths with `/org/` → `/company/`
- All URL paths with `/platform/tenants` → `/platform/companies`
- Description text updates

- [ ] **Step 3: Update HTTP client files**

In `backend/requests/http-client.env.json` and `http-client.private.env.json`:
- `orgEmail` → `companyEmail`
- `orgPassword` → `companyPassword`
- `tenantId` → `companyId`

In `backend/requests/auth.http`:
- `@name orgSignup` → `@name companySignup`
- `@name orgSignin` → `@name companySignin`
- `{{orgEmail}}` → `{{companyEmail}}`
- `{{orgPassword}}` → `{{companyPassword}}`
- URL path `/auth/org/signup` → `/auth/company/signup`

---

### Task 11: Final Verification

**Purpose:** Ensure everything compiles, lints, and tests pass.

- [ ] **Step 1: Backend typecheck**

```bash
cd backend && npm run typecheck
```

Expected: No errors.

- [ ] **Step 2: Backend lint**

```bash
cd backend && npm run lint
```

Expected: No errors.

- [ ] **Step 3: Backend build**

```bash
cd backend && npm run build
```

Expected: Successful build.

- [ ] **Step 4: Frontend build**

```bash
cd frontend && npm run build
```

Expected: Successful build (includes typecheck).

- [ ] **Step 5: Frontend lint**

```bash
cd frontend && npm run lint
```

Expected: No errors.

- [ ] **Step 6: Run backend unit tests**

```bash
cd backend && npm test
```

Expected: All tests pass.

- [ ] **Step 7: Grep for stale references**

```bash
# Check for any remaining tenant/org references in source code
rg -i "tenant" --include "*.ts" --include "*.tsx" -g "!node_modules" -g "!*.gen.ts" -g "!drizzle/*/migration.sql" -g "!drizzle/*/snapshot.json" backend/src frontend/src
rg -i "'OrgAdmin'" --include "*.ts" --include "*.tsx" -g "!node_modules" backend/src frontend/src
rg -i "/org/" --include "*.ts" --include "*.tsx" -g "!node_modules" backend/src frontend/src
```

Expected: No matches (or only legitimate matches in comments explaining the rename).

- [ ] **Step 8: Run e2e tests**

```bash
cd backend && npm run test:e2e
```

Expected: All tests pass.
