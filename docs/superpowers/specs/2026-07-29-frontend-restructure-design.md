# Frontend Folder Restructure — Design Doc

## Problem

The current `frontend/src/` structure has several issues:

1. **Duplicate `candidate/` vs `candidates/`** — both folders exist; `candidate/` has pages, `candidates/` is empty
2. **Three dashboard platforms scattered** — `OrgPlatform.tsx` in `app/`, `SuperAdminPlatform.tsx` in `app/`, `CandidatePlatform.tsx` in `shared/components/`
3. **Flat feature folders mixed across dashboards** — `dashboard/`, `pipeline/`, `interviews/`, `job-postings/` at root `features/` level, not scoped to which dashboard owns them
4. **`shared/` adds unnecessary nesting** — contents promoted to root-level `src/` directories
5. **Flat route files** — 13 files at `routes/` root with dot notation, no directory grouping
6. **Types co-located with API code** — interfaces defined in `candidateApi.ts` should be in a local types folder

## Target Structure

```
frontend/src/
  api/                          # Global API layer (was shared/api/)
    client.ts
    queryKeys.ts
    authApi.ts
    useAuth.ts                  # Zustand store

  components/                   # Global shared components (was shared/components/)
    RoleGuard.tsx

  hooks/                        # Global shared hooks (auth only — was shared/hooks/auth/)
    auth/
      useSignIn.ts
      useOrgSignup.ts
      useCandidateSignup.ts
      useLogout.ts
      useRefreshAuth.ts
      index.ts

  types/                        # Global cross-cutting types (was shared/types/)
  utils/                        # Global utilities (was shared/utils/)

  features/
    org/                        # Recruiter dashboard (OrgAdmin/OrgRecruiter/OrgHiringManager)
      layout.tsx                # moved from app/OrgPlatform.tsx
      dashboard/
      job-postings/
      candidates/               # recruiter-facing candidate management
      pipeline/
      interviews/

    candidate-portal/           # Candidate dashboard (renamed from candidate/)
      layout.tsx                # moved from shared/components/CandidatePlatform.tsx
      types/
        index.ts                # types extracted from candidateApi.ts (Job, Application, etc.)
      api/
        candidateApi.ts         # moved from shared/api/candidateApi.ts
      hooks/                    # moved from shared/hooks/candidate/
        useJobs.ts
        useJobDetail.ts
        useApplications.ts
        useApply.ts
        useBookmarks.ts
        useAddBookmark.ts
        useRemoveBookmark.ts
        useProfile.ts
        index.ts
      dashboard/
        JobSearchPage.tsx
      signup/
        SignupPage.tsx
      applications/
        ApplicationsPage.tsx
      bookmarks/
        BookmarksPage.tsx
      settings/
        SettingsPage.tsx

    admin/                      # SuperAdmin dashboard
      layout.tsx                # moved from app/SuperAdminPlatform.tsx
      tenants/
        TenantsPage.tsx

    auth/                       # Auth pages (shared across dashboards)
      SignInPage.tsx
      OrgSignupPage.tsx

  app/                          # Bootstrap only (unchanged)
    router.tsx
    providers.tsx

  routes/                       # Directory-based routing
    __root.tsx
    index.tsx
    _candidate/
      __root.tsx                # was _candidate.tsx
      dashboard.tsx             # was _candidate.dashboard.tsx
      applications.tsx          # was _candidate.applications.tsx
      bookmarks.tsx             # was _candidate.bookmarks.tsx
      settings.tsx              # was _candidate.settings.tsx
    auth/
      signin.tsx                # was auth.signin.tsx
      signup.tsx                # was auth.signup.tsx
      org/
        signup.tsx              # was auth.org.signup.tsx
    org/
      __root.tsx                # was org.tsx
      dashboard.tsx             # was org.dashboard.tsx
    admin/
      __root.tsx                # was admin.tsx
      tenants.tsx               # was admin.tenants.tsx

  routeTree.gen.ts              # auto-generated — delete and regenerate
  main.tsx
```

## Deletions

| Path | Reason |
|------|--------|
| `features/candidates/.gitkeep` | Redundant duplicate of `features/candidate/` |
| `features/dashboard/.gitkeep` | Empty scaffold — will be created under `org/` when M2+ starts |
| `features/interviews/.gitkeep` | Same |
| `features/job-postings/.gitkeep` | Same |
| `features/pipeline/.gitkeep` | Same |
| `features/platform/.gitkeep` | Same |
| `features/public-careers/.gitkeep` | Same |
| `features/resumes/.gitkeep` | Same |
| `shared/` (entire dir) | Contents moved to root-level directories |
| `src/app/OrgPlatform.tsx` | Moved to `features/org/layout.tsx` |
| `src/app/SuperAdminPlatform.tsx` | Moved to `features/admin/layout.tsx` |
| Old flat route files | Replaced by directory-based structure |

## Import Path Updates

### Route files (10 files)

| File | Old import | New import |
|------|-----------|------------|
| `index.tsx` | `../shared/api/useAuth` | `../api/useAuth` |
| `_candidate.tsx` → `_candidate/__root.tsx` | `../shared/components/CandidatePlatform` | `../features/candidate-portal/layout` |
| `_candidate.tsx` → `_candidate/__root.tsx` | `../shared/api/useAuth` | `../api/useAuth` |
| `org.tsx` → `org/__root.tsx` | `../app/OrgPlatform` | `../features/org/layout` |
| `org.tsx` → `org/__root.tsx` | `../shared/api/useAuth` | `../api/useAuth` |
| `admin.tsx` → `admin/__root.tsx` | `../app/SuperAdminPlatform` | `../features/admin/layout` |
| `admin.tsx` → `admin/__root.tsx` | `../shared/api/useAuth` | `../api/useAuth` |
| `auth.signin.tsx` → `auth/signin.tsx` | `../features/auth/SignInPage` | `../features/auth/SignInPage` (unchanged) |
| `auth.signin.tsx` → `auth/signin.tsx` | `../shared/api/useAuth` | `../api/useAuth` |
| `auth.signup.tsx` → `auth/signup.tsx` | `../features/candidate/signup/SignupPage` | `../features/candidate-portal/signup/SignupPage` |
| `auth.signup.tsx` → `auth/signup.tsx` | `../shared/api/useAuth` | `../api/useAuth` |
| `auth.org.signup.tsx` → `auth/org/signup.tsx` | `../features/auth/OrgSignupPage` | `../features/auth/OrgSignupPage` (unchanged) |
| `auth.org.signup.tsx` → `auth/org/signup.tsx` | `../shared/api/useAuth` | `../api/useAuth` |
| `_candidate.dashboard.tsx` → `_candidate/dashboard.tsx` | `../features/candidate/dashboard/JobSearchPage` | `../features/candidate-portal/dashboard/JobSearchPage` |
| `_candidate.applications.tsx` → `_candidate/applications.tsx` | `../features/candidate/applications/ApplicationsPage` | `../features/candidate-portal/applications/ApplicationsPage` |
| `_candidate.bookmarks.tsx` → `_candidate/bookmarks.tsx` | `../features/candidate/bookmarks/BookmarksPage` | `../features/candidate-portal/bookmarks/BookmarksPage` |
| `_candidate.settings.tsx` → `_candidate/settings.tsx` | `../features/candidate/settings/SettingsPage` | `../features/candidate-portal/settings/SettingsPage` |
| `admin.tenants.tsx` → `admin/tenants.tsx` | `../features/admin/TenantsPage` | `../features/admin/TenantsPage` (unchanged) |
| `org.dashboard.tsx` → `org/dashboard.tsx` | (inline component) | (inline component, unchanged) |

### Feature pages (5 files)

| File | Old import | New import |
|------|-----------|------------|
| `candidate/dashboard/JobSearchPage.tsx` | `../../../shared/hooks/candidate` | `../hooks` |
| `candidate/signup/SignupPage.tsx` | (imports from shared) | `../../api/useAuth` (candidate signup hook) |
| `candidate/applications/ApplicationsPage.tsx` | `../../../shared/hooks/candidate` | `../hooks` |
| `candidate/bookmarks/BookmarksPage.tsx` | `../../../shared/hooks/candidate` | `../hooks` |
| `candidate/settings/SettingsPage.tsx` | `../../../shared/hooks/candidate` | `../hooks` |

## SOLID Compliance

| Principle | Application |
|-----------|-------------|
| **SRP** | Each feature folder owns one domain. `org/` doesn't know about `candidate-portal/`. |
| **OCP** | New dashboards = new folder under `features/`, zero existing modifications. |
| **LSP** | All three platform layouts follow the same contract (AppShell + Outlet + nav). |
| **ISP** | Candidate hooks live in `candidate-portal/` — global consumers aren't forced to import them. |
| **DIP** | Routes depend on feature page exports via stable paths. Features depend on root-level abstractions. |

## Execution Order

1. Create new directories
2. Move/copy files to new locations (no logic changes)
3. Update import paths in moved files
4. Update import paths in route files
5. Delete old files and empty directories
6. Regenerate `routeTree.gen.ts`
7. Run `typecheck` and `lint` to verify

## Verification

- `npm run typecheck` — zero errors
- `npm run lint` — zero errors
- `npm run dev` — app boots without import errors
- Route paths unchanged (same URLs, same redirect logic)
- Auth store persists across the move (localStorage keys unchanged)
