# Rename tenant/org → company

**Date:** 2026-08-08
**Status:** Approved
**Scope:** Full-stack rename of all "tenant" and "org" identifiers, routes, DB objects, and UI text to "company".

## Motivation

The codebase uses two terms for what is conceptually the same thing — a company using the ATS:
- **"tenant"** — the infrastructure/multi-tenancy layer (DB tables, schemas, context)
- **"org"** — the product/UX layer (routes, roles, UI)

This split causes confusion. "Company" is the natural business term and covers both layers.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rename scope | Both tenant + org layers | Single consistent term across the stack |
| DB migration | Proper ALTER/RENAME migrations | Preserves existing data |
| Role rename | OrgAdmin → CompanyAdmin | Consistent with company naming |
| API routes | Clean break (no redirects) | Dev/local project, no production consumers |
| Existing migrations | Untouched | Historical records |

## Database Changes

### New migration: `20260808120000_rename_tenant_org_to_company`

| What | From | To |
|------|------|-----|
| Table | `public.tenants` | `public.companies` |
| Columns | `tenant_id` on `user_emails`, `refresh_tokens`, `audit_logs`, `candidate_bookmarks`, `candidate_applications_index`, `job_listings_index` | `company_id` |
| Indexes | `idx_audit_logs_tenant_action`, `idx_candidate_bookmarks_tenant_job`, `idx_candidate_applications_tenant_job`, `idx_job_listings_tenant` | replace `tenant` → `company` |
| PostgreSQL schemas | `tenant_<uuid>` | `company_<uuid>` (rename each) |
| Role default | `'OrgAdmin'` on `users.role` | `'CompanyAdmin'` |
| Role values | Existing `'OrgAdmin'` rows | `'CompanyAdmin'` |

### Drizzle schema (`schema.ts`)

Update all table definitions:
- `tenants` table → `companies`
- All `tenantId` columns → `companyId`
- All index names with `tenant` → `company`
- Default role value `'OrgAdmin'` → `'CompanyAdmin'`

## Backend Changes

### Files to rename

| From | To |
|------|-----|
| `common/context/tenant-context.ts` | `common/context/company-context.ts` |
| `common/interceptors/tenant-context.interceptor.ts` | `common/interceptors/company-context.interceptor.ts` |
| `repositories/tenant.repository.ts` | `repositories/company.repository.ts` |
| `modules/auth/services/tenant-provisioning.service.ts` | `modules/auth/services/company-provisioning.service.ts` |
| `modules/auth/services/tenant-provisioning.service.spec.ts` | `modules/auth/services/company-provisioning.service.spec.ts` |
| `modules/auth/dto/org-signup.dto.ts` | `modules/auth/dto/company-signup.dto.ts` |
| `modules/platform/dto/create-tenant-user.dto.ts` | `modules/platform/dto/create-company-user.dto.ts` |
| `modules/platform/dto/update-tenant-user.dto.ts` | `modules/platform/dto/update-company-user.dto.ts` |
| `modules/org/` (entire directory) | `modules/company/` |

### Class/service renames

| From | To |
|------|-----|
| `TenantContext` | `CompanyContext` |
| `TenantContextInterceptor` | `CompanyContextInterceptor` |
| `TenantRepository` | `CompanyRepository` |
| `TenantProvisioningService` | `CompanyProvisioningService` |
| `OrgModule` | `CompanyModule` |
| `OrgController` | `CompanyController` |
| `OrgService` | `CompanyService` |
| `OrgUsersController` | `CompanyUsersController` |
| `OrgUsersService` | `CompanyUsersService` |
| `OrgSignupDto` / `OrgSignupSchema` | `CompanySignupDto` / `CompanySignupSchema` |
| `UpdateOrgDto` / `UpdateOrgSchema` | `UpdateCompanyDto` / `UpdateCompanySchema` |
| `CreateTenantUserDto` / `CreateTenantUserSchema` | `CreateCompanyUserDto` / `CreateCompanyUserSchema` |
| `UpdateTenantUserDto` / `UpdateTenantUserSchema` | `UpdateCompanyUserDto` / `UpdateCompanyUserSchema` |

### Function renames

| From | To |
|------|-----|
| `getTenantId()` | `getCompanyId()` |
| `forCurrentTenant()` | `forCurrentCompany()` |
| `invalidateTenantDashboard()` | `invalidateCompanyDashboard()` |
| `getTenantDashboardGeneration()` | `getCompanyDashboardGeneration()` |
| `setTenantDashboardIfGeneration()` | `setCompanyDashboardIfGeneration()` |
| `listTenants()` | `listCompanies()` |
| `getTenant()` | `getCompany()` |
| `setTenantStatus()` | `setCompanyStatus()` |
| `createTenant()` | `createCompany()` |
| `listTenantUsers()` | `listCompanyUsers()` |
| `createTenantUser()` | `createCompanyUser()` |
| `updateTenantUser()` | `updateCompanyUser()` |
| `setTenantUserStatus()` | `setCompanyUserStatus()` |
| `removeTenantUser()` | `removeCompanyUser()` |
| `listTenantStages()` | `listCompanyStages()` |
| `requireTenant()` | `requireCompany()` |
| `orgSignup()` | `companySignup()` |
| `ensureOrgAdminRemains()` | `ensureCompanyAdminRemains()` |
| `requireActiveTenant()` | `requireActiveCompany()` |
| `requireOpenTenantJob()` | `requireOpenCompanyJob()` |
| `findOpenByTenant()` | `findOpenByCompany()` |
| `findOpenByTenantAndJob()` | `findOpenByCompanyAndJob()` |
| `dashboardSummaryKey()` prefix `tenant:` | `company:` |
| `dashboardGenerationKey()` prefix `tenant:` | `company:` |

### Variable/constant renames

| From | To |
|------|-----|
| `tenantId` (all occurrences) | `companyId` |
| `tenant` (as entity variable) | `company` |
| `tenantSlug` | `companySlug` |
| `orgOwner` | `companyOwner` |
| `NIL_TENANT_ID` | `NIL_COMPANY_ID` |
| `TENANT_TABLES` | `COMPANY_TABLES` |

### Route renames

| From | To |
|------|-----|
| `/org` | `/company` |
| `/org/users` | `/company/users` |
| `/org/users/invite` | `/company/users/invite` |
| `/org/users/:userId/role` | `/company/users/:userId/role` |
| `/org/users/:userId` | `/company/users/:userId` |
| `/org/pipeline-stages` | `/company/pipeline-stages` |
| `/auth/org/signup` | `/auth/company/signup` |
| `/platform/tenants` | `/platform/companies` |
| `/platform/tenants/:id` | `/platform/companies/:id` |
| `/platform/tenants/:id/suspend` | `/platform/companies/:id/suspend` |
| `/platform/tenants/:id/reactivate` | `/platform/companies/:id/reactivate` |
| `/platform/tenants/:id/users` | `/platform/companies/:id/users` |
| `/platform/tenants/:id/users/:userId` | `/platform/companies/:id/users/:userId` |
| `/platform/tenants/:id/users/:userId/suspend` | `/platform/companies/:id/users/:userId/suspend` |
| `/platform/tenants/:id/users/:userId/reactivate` | `/platform/companies/:id/users/:userId/reactivate` |
| `/platform/tenants/:id/users/:userId` (DELETE) | `/platform/companies/:id/users/:userId` |
| `/platform/tenants/:id/pipeline-stages` | `/platform/companies/:id/pipeline-stages` |
| `/public/:tenantSlug/jobs` | `/public/:companySlug/jobs` |
| `/public/:tenantSlug/jobs/:id` | `/public/:companySlug/jobs/:id` |
| `/candidate/jobs/:tenantId/:jobId` | `/candidate/jobs/:companyId/:jobId` |
| `/candidate/jobs/:tenantId/:jobId/apply` | `/candidate/jobs/:companyId/:jobId/apply` |
| Query param `?tenantId=` | `?companyId=` |

### Other backend changes

- **Cache keys:** `tenant:{companyId}:*` → `company:{companyId}:*`
- **S3 paths:** `tenants/{companyId}/` → `companies/{companyId}/`
- **Schema prefix:** `tenant_${id}` → `company_${id}`
- **Role string:** `'OrgAdmin'` → `'CompanyAdmin'` in all controllers, services, guards, seed
- **App module:** Import `CompanyModule` instead of `OrgModule`
- **JWT strategy:** `payload.tenantId` → `payload.companyId`
- **Queues:** `tenantId` in notification payload → `companyId`

## Frontend Changes

### Directories to rename

| From | To |
|------|-----|
| `features/org/` | `features/company/` |
| `routes/org/` | `routes/company/` |
| `routes/auth/org/` | `routes/auth/company/` |

### Files to rename

| From | To |
|------|-----|
| `features/admin/TenantsPage.tsx` | `features/admin/CompaniesPage.tsx` |
| `features/admin/TenantDetailPage.tsx` | `features/admin/CompanyDetailPage.tsx` |
| `features/auth/OrgSignupPage.tsx` | `features/auth/CompanySignupPage.tsx` |
| `features/org/layout.tsx` | `features/company/layout.tsx` |
| `features/org/dashboard/OrgDashboardPage.tsx` | `features/company/dashboard/CompanyDashboardPage.tsx` |
| `features/org/settings/OrgSettingsPage.tsx` | `features/company/settings/CompanySettingsPage.tsx` |
| `features/org/settings/hooks/useOrgSettings.ts` | `features/company/settings/hooks/useCompanySettings.ts` |
| `features/org/users/hooks/useOrgUsers.ts` | `features/company/users/hooks/useCompanyUsers.ts` |
| `routes/admin/tenants.tsx` | `routes/admin/companies.tsx` |
| `routes/admin/tenants.$tenantId.tsx` | `routes/admin/companies.$companyId.tsx` |
| `routes/org.tsx` | `routes/company.tsx` |
| `routes/org/dashboard.tsx` | `routes/company/dashboard.tsx` |
| `routes/org/settings.tsx` | `routes/company/settings.tsx` |
| `routes/org/users.tsx` | `routes/company/users.tsx` |
| `routes/auth/org/signup.tsx` | `routes/auth/company/signup.tsx` |
| `api/orgApi.ts` | `api/companyApi.ts` |
| `api/orgUsersApi.ts` | `api/companyUsersApi.ts` |
| `hooks/auth/useOrgSignup.ts` | `hooks/auth/useCompanySignup.ts` |

### Component/type renames

| From | To |
|------|-----|
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
| `TenantAccount` (e2e tests) | `CompanyAccount` |

### Hook renames

| From | To |
|------|-----|
| `usePlatformTenants()` | `usePlatformCompanies()` |
| `useTenantDetail()` | `useCompanyDetail()` |
| `useSetTenantStatus()` | `useSetCompanyStatus()` |
| `useTenantUsers()` | `useCompanyUsers()` |
| `usePlatformStages()` | `usePlatformStages()` (unchanged — already generic) |
| `usePlatformApplications(filters)` | `usePlatformApplications(filters)` (param name changes) |
| `usePlatformInterviews(filters)` | `usePlatformInterviews(filters)` (param name changes) |
| `useCreateTenantUser()` | `useCreateCompanyUser()` |
| `useUpdateTenantUser()` | `useUpdateCompanyUser()` |
| `useSetTenantUserStatus()` | `useSetCompanyUserStatus()` |
| `useRemoveTenantUser()` | `useRemoveCompanyUser()` |
| `useOrgSettings()` | `useCompanySettings()` |
| `useUpdateOrgSettings()` | `useUpdateCompanySettings()` |
| `useOrgUsers()` | `useCompanyUsers()` |
| `useOrgSignup()` | `useCompanySignup()` |

### API client renames

| From | To |
|------|-----|
| `orgApi` | `companyApi` |
| `orgUsersApi` | `companyUsersApi` |
| `authApi.orgSignup()` | `authApi.companySignup()` |
| All `platformApi.*Tenant*()` methods | `*Company*()` |

### Query key renames

| From | To |
|------|-----|
| `queryKeys.org.orgUsers()` | `queryKeys.company.companyUsers()` |
| `queryKeys.org.orgSettings()` | `queryKeys.company.companySettings()` |
| `queryKeys.platform.tenants()` | `queryKeys.platform.companies()` |
| `queryKeys.platform.tenant()` | `queryKeys.platform.company()` |
| `queryKeys.platform.tenantUsers()` | `queryKeys.platform.companyUsers()` |
| `queryKeys.platform.tenantStages()` | `queryKeys.platform.companyStages()` |
| `queryKeys.candidate.jobDetail(tenantId, jobId)` | `queryKeys.candidate.jobDetail(companyId, jobId)` |
| `queryKeys.publicCareers.jobs(tenantSlug)` | `queryKeys.publicCareers.jobs(companySlug)` |
| `queryKeys.publicCareers.job(tenantSlug, jobId)` | `queryKeys.publicCareers.job(companySlug, jobId)` |

### Auth store

| From | To |
|------|-----|
| `AuthState.tenantId` | `AuthState.companyId` |
| `localStorage.getItem('tenantId')` | `localStorage.getItem('companyId')` |
| `localStorage.setItem('tenantId', ...)` | `localStorage.setItem('companyId', ...)` |
| `localStorage.removeItem('tenantId')` | `localStorage.removeItem('companyId')` |

### Route paths (frontend)

| From | To |
|------|-----|
| `/org/dashboard` | `/company/dashboard` |
| `/org/job-postings` | `/company/job-postings` |
| `/org/candidates` | `/company/candidates` |
| `/org/pipeline` | `/company/pipeline` |
| `/org/interviews` | `/company/interviews` |
| `/org/settings` | `/company/settings` |
| `/org/users` | `/company/users` |
| `/auth/org/signup` | `/auth/company/signup` |
| `/admin/tenants` | `/admin/companies` |
| `/admin/tenants/$tenantId` | `/admin/companies/$companyId` |
| `/careers/$tenantSlug/jobs` | `/careers/$companySlug/jobs` |
| `/careers/$tenantSlug/jobs/$jobId` | `/careers/$companySlug/jobs/$jobId` |

### Redirect targets

All instances of `'/org/dashboard'` → `'/company/dashboard'`
All instances of `'/admin/tenants'` → `'/admin/companies'`

### Role checks

All `role === 'OrgAdmin'` → `role === 'CompanyAdmin'`

### Route tree

`frontend/src/routeTree.gen.ts` — will be regenerated by TanStack Router after file renames.

## Tests

### E2E tests (`backend/test/`)

All 6 e2e spec files:
- Update route paths (`/auth/org/signup` → `/auth/company/signup`, `/org/*` → `/company/*`, `/platform/tenants/*` → `/platform/companies/*`)
- Update role strings (`'OrgAdmin'` → `'CompanyAdmin'`)
- Update variable names (`tenantId` → `companyId`, `TenantAccount` → `CompanyAccount`, `createTenant*` → `createCompany*`)
- Update schema references (`tenant_${id}` → `company_${id}`)

### Unit specs (`backend/src/**/*.spec.ts`)

- Update imports for renamed classes/services
- Update `TenantContext` → `CompanyContext` references
- Update `getTenantId()` → `getCompanyId()` calls
- Update `'OrgAdmin'` → `'CompanyAdmin'` role strings
- Update `runInTenant()` → `runInCompany()` helper

## Documentation

### Files to update

| File | Changes |
|------|---------|
| `AGENTS.md` | All tenant/org references → company |
| `docs/00_PROJECT_INSTRUCTIONS.md` | All references |
| `docs/01_TALENTPIPE_PRD_SRS.md` | All references |
| `docs/02_TECHNICAL_OVERVIEW.md` | All references |
| `docs/03_RECRUITMENT_ATS_ARCHITECTURE.md` | All references |
| `docs/04_ERD_DIAGRAM.md` | Entity/relationship names |
| `docs/05_DATA_ISOLATION_STRATEGY.md` | Heaviest tenant doc — full rewrite of examples |
| `docs/06_ROLE_INTERACTIONS.md` | All references |
| `docs/07_API_ENDPOINT_DOCUMENTATION.md` | All endpoint paths and descriptions |
| `docs/08_FRONTEND_COMPONENT_STRUCTURE.md` | All references |
| `docs/09_IMPLEMENTATION_GUIDE.md` | All references |
| `docs/DATA_MODEL_DEFINITION.md` | Role default value |
| `.opencode/agents/talentpipe-planning.md` | References |
| `.opencode/agents/talentpipe-debugger.md` | References |

### Config/data files

| File | Changes |
|------|---------|
| `docs/talentpipe-postman.json` | Variables (`tenantId` → `companyId`, `orgEmail` → `companyEmail`), URLs |
| `backend/requests/http-client.env.json` | `orgEmail` → `companyEmail`, `orgPassword` → `companyPassword` |
| `backend/requests/http-client.private.env.json` | `tenantId` → `companyId` |
| `backend/requests/auth.http` | `orgSignup` → `companySignup`, variable names |

## Files NOT modified

- Existing migration SQL files under `backend/drizzle/*/migration.sql`
- Existing `snapshot.json` files (drizzle-kit managed)
- `node_modules/`, `package-lock.json`

## Execution Order

1. Create DB migration (ALTER TABLE/SCHEMA renames + role migration)
2. Update `schema.ts` (Drizzle table/column definitions)
3. Rename backend files/directories
4. Update all backend identifiers (classes, functions, variables, routes)
5. Rename frontend files/directories
6. Update all frontend identifiers (components, hooks, API clients, routes)
7. Update tests (e2e + unit)
8. Update docs and config files
9. Regenerate TanStack Router route tree
10. Run verification: `npm run typecheck && npm run lint && npm run build && npm test`

## Risks

| Risk | Mitigation |
|------|------------|
| Missed reference | Grep for `tenant`, `org`, `OrgAdmin` after each phase |
| Migration failure on renamed schemas | Test migration on a copy of the DB first |
| Route tree stale after file renames | Delete `routeTree.gen.ts` and let Vite regenerate |
| JWT tokens with old `tenantId` field | Dev-only — all tokens expire in 15min, re-login resolves |
| localStorage with old `tenantId` key | Frontend gracefully handles missing key on first load |
