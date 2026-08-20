# TalentPipe — Frontend Component Structure

**Purpose:** Defines the React + TypeScript frontend layout — feature-folders, routing, role guards, and per-feature components. Use this when scaffolding or implementing the UI. Mirrors backend module boundaries from `03_RECRUITMENT_ATS_ARCHITECTURE.md` / `00_PROJECT_INSTRUCTIONS.md` §9.

React + TypeScript + Mantine + TanStack Query/Router. Feature-folder structure, matching the backend's module boundaries so a feature's frontend and backend code are easy to reason about together.

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

## 1. Top-Level Structure

```
/src
  /main.tsx, /App.tsx       # entry + root providers
  /app
    providers.tsx           # MantineProvider + Notifications + QueryClientProvider + RouterProvider
    router.tsx              # createRouter + routeTree import
  /routes                   # FILE-BASED ROUTES (TanStack Router) → generated routeTree.gen.ts
  /features                 # feature-folders matching backend modules
    /auth                   # LoginPage, SignupPage, CompanySignupPage
    /company                    # CompanyPlatform layout + internal company UI (job postings, candidates, pipeline, interviews, settings)
    /admin                  # SuperAdminPlatform layout + platform UI (CompaniesList, CompanyDetail, PlatformStats)
    /candidate-portal       # CandidatePlatform layout + candidate-facing UI (separate shell)
    /dashboard, /job-postings, /candidates, /pipeline, /resumes,
    /interviews, /public-careers   # scaffolded folders for M2+ features
  /api
    client.ts               # axios instance (baseURL /api, token, 401→refresh→retry)
    useAuth.ts              # Zustand auth store (persisted)
    authApi.ts              # auth endpoints + types
    queryKeys.ts            # TanStack Query cache-key factory
    jobPostingsApi.ts, candidatesApi.ts, skillsApi.ts   # M2
  /hooks
    useApiMutation.ts       # mutation wrapper with auto success/error toasts
  /components, /types, /utils
```

## 2. Routing & Access Control (file-based, TanStack Router)

```
/auth/signin        → public (unified login — company users + candidates)
/auth/signup        → public (candidate account)
/auth/company/signup    → public (company + Company Admin)

/_candidate.tsx     → pathless layout (CandidatePlatform) + beforeLoad guard: requireRole(Candidate)
/dashboard          → Candidate (job search) — URL: /dashboard
/applications       → Candidate (history)
/bookmarks          → Candidate (saved jobs)
/settings           → Candidate (profile)

/company.tsx            → layout (CompanyPlatform) + beforeLoad guard: requireRole(CompanyAdmin|Recruiter|HiringManager|Interviewer)
/company/dashboard      → internal company dashboard
/company/job-postings   → M2
/company/candidates     → M2
/company/pipeline       → M3
/company/interviews     → M8 ✅
/company/settings       → M9 ✅ (CompanyAdmin-only `beforeLoad`; CompanyPlatform shows the link only for CompanyAdmin)
/company/users          → M9 ✅ (CompanyAdmin-only `beforeLoad`)

/_candidate/jobs/$jobId → M11 ✅ (candidate job detail; URL `/jobs/$jobId`, `companyId` as search param; renders the shared `JobDetailsView`)

/admin.tsx          → layout (SuperAdminPlatform) + beforeLoad guard: requireRole(SuperAdmin)
/admin/companies      → M9 ✅ (stats cards + company table)
/admin/companies/$companyId → M9 ✅ (company detail + suspend/reactivate) — M11 ✅ adds Users / Applications / Interviews tabs
/admin/candidates   → M11 ✅ (cross-company candidate table + create/edit/delete)
```

Access control is enforced in each route's `beforeLoad` (TanStack Router), redirecting to the correct platform by role — there is no `<RoleGuard>` wrapper component. `/admin/*` uses a distinct top-level `SuperAdminPlatform`; candidate routes use the pathless `_candidate` layout → `CandidatePlatform`. The three platform layout components live at `features/{company,admin,candidate-portal}/layout.tsx` (`CompanyPlatform`, `SuperAdminPlatform`, `CandidatePlatform`).

## 3. Feature Modules

### `/features/auth` ✅
- `SignInPage.tsx` — unified login (`POST /auth/signin`), role-based redirect
- `SignupPage.tsx` — candidate signup (`POST /auth/signup`)
- `CompanySignupPage.tsx` — company + Company Admin (`POST /auth/company/signup`)
- All use `useApiMutation` (auto-toasts); auth state via `api/useAuth.ts` (Zustand)

### `/features/company` — internal company UI (M2–M8 implemented, M9 admin views done)
- `CompanyDashboard.tsx`
- `JobPostingList.tsx`, `JobPostingForm.tsx` (M2), `RequiredSkillsPicker.tsx`
- `CandidateList.tsx`, `CandidateProfile.tsx` (M2)
- `PipelineBoard.tsx`, `PipelineColumn.tsx`, `ApplicationCard.tsx` (M3, dnd-kit), `ApplicationDetailDrawer.tsx` (notes + live interviews tab), `NotesList`/`NoteForm`, `StageEditor.tsx`
- `interviews/` (M8 ✅): `InterviewListView.tsx` (role-aware table), `InterviewScheduler.tsx` (modal, native datetime-local), `InterviewFeedbackForm.tsx` (Rating 1–5 + comments), `hooks/useInterviews.ts`
- `settings/` (M9 ✅): `CompanySettingsPage.tsx` — company name editable (CompanyAdmin), slug/plan/status read-only
- `users/` (M9 ✅): `UserManagementPage.tsx` — team table (email/role select/created/remove), invite modal (email + role + initial password), self/last-admin disabled

### `/features/admin` — SuperAdmin platform (M9 ✅, M11 ✅)
- `CompaniesPage.tsx` — platform stats cards (companies/users/applications) + company table (company, slug, plan, status, created)
- `CompanyDetailPage.tsx` — detail + usage counts + suspend/reactivate buttons, with **M11 tabs**: Users (table: email/role/status/created + create modal + role Select + reset-password + suspend/reactivate + remove confirm), Applications (table: candidate/job/stage/date + stage Select from the company's stages), Interviews (table: candidate/job/interviewer/datetime/status + reschedule/cancel)
- `CandidatesPage.tsx` (M11) — cross-company candidate table (name/email/created) + create/edit modal + delete confirm
- Route: `/admin/companies` (list), `/admin/companies/$companyId` (detail, tabs), `/admin/candidates`

### `/features/candidate-portal` ✅ (implemented)
- `CandidatePlatform.tsx` (`layout.tsx`) — minimal header + nav (dashboard, applications, bookmarks, settings)
- `dashboard/JobSearchPage.tsx` — search/browse open jobs across companies; job cards link to `/jobs/$jobId` (M11)
- `jobs/JobDetailsView.tsx` (M11) — shared job-detail component (also rendered by the public `JobDetailPage`); candidate route passes `companyId` as a search param and uses the authenticated job-detail API
- `signup/SignupPage.tsx` — candidate registration (rendered at `/auth/signup`)
- `applications/ApplicationsPage.tsx` — history with status badges per company; rows link to the job detail page, drawer shows a status timeline (Applied → current stage) and a Withdraw button with confirm (M11; calls `DELETE /candidate/applications/:id`)
- `bookmarks/BookmarksPage.tsx` — saved jobs
- `settings/SettingsPage.tsx` — edit profile

### `/features/public-careers` ✅ (M5)
- `JobListingPage.tsx`, `JobDetailPage.tsx`, public careers API/hooks
- Company-specific routes: `/careers/$companySlug/jobs` and `/careers/$companySlug/jobs/$jobId`
- Apply redirects anonymous visitors to unified sign-in/signup with a safe return path; authenticated Candidates use the shared `CandidateApplyModal` and existing candidate apply API

### `/features/resumes` (scaffolded; M4)
- `ResumeUploadInput.tsx`, `MatchScoreBadge.tsx`

## 4. API Layer

- `api/client.ts` — axios instance with `baseURL: '/api'`, attaches the access token, and transparently refreshes on 401 (single in-flight refresh).
- `api/useAuth.ts` — Zustand store (login/signup/logout/refresh) persisted to `localStorage`.
- `api/authApi.ts` — auth endpoints + TypeScript types.
- `api/queryKeys.ts` — TanStack Query cache-key factory. List queries take a params object as their key segment; mutation invalidations use the param-less prefix (prefix-matching invalidates all variants).
- One file per resource (M2+): `jobPostingsApi.ts`, `candidatesApi.ts`, `skillsApi.ts` — each exporting TanStack Query hooks (`useJobPostings(...)`, `useCreateJobPosting`, etc.). Mutations use the `useApiMutation` wrapper for toasts.

## 5. Shared List Query Layer (M15)

- `shared/types/listQuery.ts` — `ListQueryParams` (`search`, `page`, `pageSize`, `sortBy`, `sortDir`) + `Paginated<T>` (`{ data, total, page, pageSize }`) matching the backend envelope.
- `shared/hooks/useListQuery.ts` — one state hook per list page: debounced search (300ms, Mantine `useDebouncedValue`), page, sortBy + sortDir with toggle; returns `params` ready to spread into list-hook calls.
- `shared/components/ListControls.tsx` — search `TextInput`, optional filter `Select`s, "Sort by" `Select`, asc/desc toggle button; used above every list table/grid.
- Every list page renders a server-driven Mantine `Pagination` from `Paginated.total` (admin pages no longer slice client-side).

## 6. Build Order (matches backend milestones)

1. ✅ Auth + `CompanyPlatform`/`SuperAdminPlatform`/`CandidatePlatform` shells + file-based routing + role-gated `beforeLoad` guards
2. ✅ Job postings + candidates (basic CRUD, tables)
3. ✅ Pipeline board (Kanban, drag-and-drop) — demo centerpiece
4. ✅ Candidate profile resume storage + manual skills and match score display
5. ✅ Public careers pages (separate shell, no auth for browsing; Candidate auth required to apply)
6. ✅ Interviews + feedback
7. ✅ Admin (`/company/settings`, `/company/users`) and Platform (`/admin/companies`, `/admin/companies/$companyId`) views
8. ✅ Candidate portal — signup, job search, applications, bookmarks, profile (built early)
9. ✅ M11 — platform account/data tabs in company detail (`/admin/companies/$companyId`), `/admin/candidates`, candidate job detail (`/jobs/$jobId` via shared `JobDetailsView`), applications stepper + withdraw
