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
    /auth                   # LoginPage, SignupPage, OrgSignupPage
    /org                    # OrgPlatform layout + internal tenant UI (job postings, candidates, pipeline, interviews, settings)
    /admin                  # SuperAdminPlatform layout + platform UI (TenantsList, TenantDetail, PlatformStats)
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
/auth/signin        → public (unified login — org users + candidates)
/auth/signup        → public (candidate account)
/auth/org/signup    → public (tenant + Org Admin)

/_candidate.tsx     → pathless layout (CandidatePlatform) + beforeLoad guard: requireRole(Candidate)
/dashboard          → Candidate (job search) — URL: /dashboard
/applications       → Candidate (history)
/bookmarks          → Candidate (saved jobs)
/settings           → Candidate (profile)

/org.tsx            → layout (OrgPlatform) + beforeLoad guard: requireRole(OrgAdmin|Recruiter|HiringManager|Interviewer)
/org/dashboard      → internal tenant dashboard
/org/job-postings   → M2
/org/candidates     → M2
/org/pipeline       → M3
/org/interviews     → M8 ✅
/org/settings       → M9 ✅ (OrgAdmin-only `beforeLoad`; OrgPlatform shows the link only for OrgAdmin)
/org/users          → M9 ✅ (OrgAdmin-only `beforeLoad`)

/admin.tsx          → layout (SuperAdminPlatform) + beforeLoad guard: requireRole(SuperAdmin)
/admin/tenants      → M9 ✅ (stats cards + tenant table)
/admin/tenants/$tenantId → M9 ✅ (tenant detail + suspend/reactivate)
```

Access control is enforced in each route's `beforeLoad` (TanStack Router), redirecting to the correct platform by role — there is no `<RoleGuard>` wrapper component. `/admin/*` uses a distinct top-level `SuperAdminPlatform`; candidate routes use the pathless `_candidate` layout → `CandidatePlatform`. The three platform layout components live at `features/{org,admin,candidate-portal}/layout.tsx` (`OrgPlatform`, `SuperAdminPlatform`, `CandidatePlatform`).

## 3. Feature Modules

### `/features/auth` ✅
- `SignInPage.tsx` — unified login (`POST /auth/signin`), role-based redirect
- `SignupPage.tsx` — candidate signup (`POST /auth/signup`)
- `OrgSignupPage.tsx` — tenant + Org Admin (`POST /auth/org/signup`)
- All use `useApiMutation` (auto-toasts); auth state via `api/useAuth.ts` (Zustand)

### `/features/org` — internal tenant UI (M2–M8 implemented, M9 admin views done)
- `OrgDashboard.tsx`
- `JobPostingList.tsx`, `JobPostingForm.tsx` (M2), `RequiredSkillsPicker.tsx`
- `CandidateList.tsx`, `CandidateProfile.tsx` (M2)
- `PipelineBoard.tsx`, `PipelineColumn.tsx`, `ApplicationCard.tsx` (M3, dnd-kit), `ApplicationDetailDrawer.tsx` (notes + live interviews tab), `NotesList`/`NoteForm`, `StageEditor.tsx`
- `interviews/` (M8 ✅): `InterviewListView.tsx` (role-aware table), `InterviewScheduler.tsx` (modal, native datetime-local), `InterviewFeedbackForm.tsx` (Rating 1–5 + comments), `hooks/useInterviews.ts`
- `settings/` (M9 ✅): `OrgSettingsPage.tsx` — company name editable (OrgAdmin), slug/plan/status read-only
- `users/` (M9 ✅): `UserManagementPage.tsx` — team table (email/role select/created/remove), invite modal (email + role + initial password), self/last-admin disabled

### `/features/admin` — SuperAdmin platform (M9 ✅)
- `TenantsPage.tsx` — platform stats cards (tenants/users/applications) + tenant table (company, slug, plan, status, created)
- `TenantDetail.tsx` — detail + usage counts + suspend/reactivate buttons
- Route: `/admin/tenants` (list), `/admin/tenants/$tenantId` (detail)

### `/features/candidate-portal` ✅ (implemented)
- `CandidatePlatform.tsx` (`layout.tsx`) — minimal header + nav (dashboard, applications, bookmarks, settings)
- `dashboard/JobSearchPage.tsx` — search/browse open jobs across tenants
- `signup/SignupPage.tsx` — candidate registration (rendered at `/auth/signup`)
- `applications/ApplicationsPage.tsx` — history with status badges per tenant
- `bookmarks/BookmarksPage.tsx` — saved jobs
- `settings/SettingsPage.tsx` — edit profile

### `/features/public-careers` ✅ (M5)
- `JobListingPage.tsx`, `JobDetailPage.tsx`, public careers API/hooks
- Tenant-specific routes: `/careers/$tenantSlug/jobs` and `/careers/$tenantSlug/jobs/$jobId`
- Apply redirects anonymous visitors to unified sign-in/signup with a safe return path; authenticated Candidates use the shared `CandidateApplyModal` and existing candidate apply API

### `/features/resumes` (scaffolded; M4)
- `ResumeUploadInput.tsx`, `MatchScoreBadge.tsx`

## 4. API Layer

- `api/client.ts` — axios instance with `baseURL: '/api'`, attaches the access token, and transparently refreshes on 401 (single in-flight refresh).
- `api/useAuth.ts` — Zustand store (login/signup/logout/refresh) persisted to `localStorage`.
- `api/authApi.ts` — auth endpoints + TypeScript types.
- `api/queryKeys.ts` — TanStack Query cache-key factory.
- One file per resource (M2+): `jobPostingsApi.ts`, `candidatesApi.ts`, `skillsApi.ts` — each exporting TanStack Query hooks (`useJobPostings(...)`, `useCreateJobPosting`, etc.). Mutations use the `useApiMutation` wrapper for toasts.

## 5. Build Order (matches backend milestones)

1. ✅ Auth + `OrgPlatform`/`SuperAdminPlatform`/`CandidatePlatform` shells + file-based routing + role-gated `beforeLoad` guards
2. ✅ Job postings + candidates (basic CRUD, tables)
3. ✅ Pipeline board (Kanban, drag-and-drop) — demo centerpiece
4. ✅ Candidate profile resume storage + manual skills and match score display
5. ✅ Public careers pages (separate shell, no auth for browsing; Candidate auth required to apply)
6. ✅ Interviews + feedback
7. ✅ Admin (`/org/settings`, `/org/users`) and Platform (`/admin/tenants`, `/admin/tenants/$tenantId`) views
8. ✅ Candidate portal — signup, job search, applications, bookmarks, profile (built early)
