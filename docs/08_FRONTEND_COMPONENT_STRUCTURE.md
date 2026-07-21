# TalentPipe — Frontend Component Structure

**Purpose:** Defines the React + TypeScript frontend layout — feature-folders, routing, role guards, and per-feature components. Use this when scaffolding or implementing the UI. Mirrors backend module boundaries from `03_RECRUITMENT_ATS_ARCHITECTURE.md` / `00_PROJECT_INSTRUCTIONS.md` §9.

React + TypeScript + Mantine + TanStack Query/Router. Feature-folder structure, matching the backend's module boundaries so a feature's frontend and backend code are easy to reason about together.

> **Canonical source:** `00_PROJECT_INSTRUCTIONS.md` supersedes this doc. Where they differ, follow `00_PROJECT_INSTRUCTIONS.md`.

## 1. Top-Level Structure

```
/src
  /app
    App.tsx                 # root: providers, router outlet
    router.tsx               # route tree, role guards
    providers.tsx             # QueryClientProvider, MantineProvider, AuthProvider
  /features
    /auth
    /dashboard
    /job-postings
    /candidates
    /pipeline
    /resumes
    /interviews
    /public-careers
    /admin                   # OrgAdmin-only settings
    /platform                # SuperAdmin-only, cross-tenant
  /shared
    /components
    /hooks
    /api
    /types
    /utils
```

## 2. Routing & Access Control

```
/                      → redirect to /login or /dashboard
/login, /signup        → public
/careers/:tenantSlug   → public, no auth (candidate-facing)
/careers/:tenantSlug/jobs/:jobId → public

/dashboard             → authenticated, any internal role
/job-postings/*        → Recruiter, Org Admin
/candidates/*          → Recruiter, Hiring Manager, Org Admin
/pipeline               → Recruiter, Hiring Manager, Org Admin
/interviews/*           → Interviewer (own only), Recruiter, Hiring Manager
/org/settings            → Org Admin only
/org/users                → Org Admin only
/platform/*                → SuperAdmin only (separate route tree, not nested under /org)
```

A `<RoleGuard roles={[...]}>` wrapper component (in `/shared/components`) checks the current user's role from `useAuth()` and either renders children or redirects/shows a 403 view. `/platform/*` uses a distinct top-level layout (`PlatformShell`) rather than reusing the tenant dashboard shell, since a SuperAdmin isn't scoped to one tenant.

## 3. Feature Modules

### `/features/auth`
- `LoginForm.tsx`
- `SignupForm.tsx` — creates Tenant + first Org Admin
- `useAuth.ts` — hook wrapping login/logout/refresh, exposes `user`, `role`, `tenantId`

### `/features/dashboard`
- `DashboardOverview.tsx` — top-level page
- `StatsCards.tsx` — open postings, active applications, interviews this week
- `RecentActivityFeed.tsx`

### `/features/job-postings`
- `JobPostingList.tsx`
- `JobPostingForm.tsx` — create/edit, includes `RequiredSkillsPicker`
- `JobPostingDetail.tsx`
- `RequiredSkillsPicker.tsx` — multi-select against the Skill taxonomy

### `/features/candidates`
- `CandidateList.tsx`
- `CandidateProfile.tsx` — resume link, extracted skills, application history
- `CandidateSkillsBadgeList.tsx`

### `/features/pipeline` (the visual centerpiece)
- `PipelineBoard.tsx` — Kanban board, one column per `PipelineStage`
- `PipelineColumn.tsx`
- `ApplicationCard.tsx` — draggable card (dnd-kit), shows match score
- `ApplicationDetailDrawer.tsx` — opens on card click: notes, interviews, stage history
- `NotesList.tsx` / `NoteForm.tsx`
- `StageEditor.tsx` — Org Admin: reorder/rename pipeline stages

### `/features/resumes`
- `ResumeUploadInput.tsx` — shared between internal manual-add flow and public apply flow
- `MatchScoreBadge.tsx` — visual score indicator on an ApplicationCard/detail view

### `/features/interviews`
- `InterviewScheduler.tsx`
- `InterviewCalendarView.tsx` — simple week/list view, not a full calendar sync
- `InterviewFeedbackForm.tsx` — rating + comments, only visible/editable by the assigned interviewer

### `/features/public-careers` (no auth, separate visual shell — no dashboard chrome)
- `JobListingPage.tsx`
- `JobDetailPage.tsx`
- `ApplyForm.tsx` — name, email, resume upload, honeypot field for spam prevention
- `ApplySuccessPage.tsx`

### `/features/admin` (Org Admin, tenant-scoped)
- `OrgSettingsForm.tsx`
- `UserManagementTable.tsx` — invite/remove recruiters, assign roles
- `PipelineStageEditor.tsx` (reused from `/features/pipeline`)

### `/features/platform` (SuperAdmin, cross-tenant)
- `TenantsList.tsx` — all tenants on the platform
- `TenantDetail.tsx` — usage stats, suspend/reactivate
- `PlatformStats.tsx`

## 4. Shared Layer

`/shared/components`
- `AppShell.tsx` — sidebar + topbar layout for internal dashboard
- `PlatformShell.tsx` — separate shell for SuperAdmin views
- `DataTable.tsx` — thin wrapper around Mantine's table + TanStack Table for sorting/pagination
- `EmptyState.tsx`, `ConfirmDialog.tsx`, `FileUploadZone.tsx`, `RoleGuard.tsx`

`/shared/hooks`
- `useAuth.ts`, `useTenant.ts`, `usePermission.ts` (`can('applications:move-stage')` style checks)

`/shared/api`
- One file per resource, each exporting TanStack Query hooks: `useJobPostings.ts`, `useApplications.ts`, `useCandidates.ts`, `useInterviews.ts`, etc. — these call the backend API and match the endpoints in `07_API_ENDPOINT_DOCUMENTATION.md`.

`/shared/types`
- Mirrors backend Zod schemas where practical (consider a shared types package if you want to enforce this, otherwise keep frontend types hand-written and in sync manually for a solo project).

## 5. Build Order (matches backend milestones)

1. Auth + `AppShell` + `RoleGuard`
2. Job postings + candidates (basic CRUD, tables)
3. Pipeline board (Kanban, drag-and-drop) — get this feeling good early, it's your demo centerpiece
4. Resume upload + match score display
5. Public careers pages (separate shell, no auth)
6. Interviews + feedback
7. Admin (`/org/settings`, `/org/users`) and Platform (`/platform/*`) views last — least visually interesting, least urgent for a demo
