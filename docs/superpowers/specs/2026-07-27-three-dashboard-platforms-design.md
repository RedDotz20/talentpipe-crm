# Three-Dashboard Platform Layouts

**Date:** 2026-07-27
**Status:** Approved design
**Goal:** Restructure frontend routing into role-based platform layouts with proper auth guards.

## Problem

Authenticated users could still access login/signup pages via browser back button. The existing `AppShell` served all internal roles without distinction, and SuperAdmin had no dedicated layout or route tree.

## Solution

Three named platform layouts, each with its own shell, nav items, and route tree. Auth `beforeLoad` guards redirect users to the correct platform based on their role.

## Route Tree

```
rootRoute (no component — grouping node only)
├── /login                          ← LoginPage
├── /signup                         ← SignupPage
├── CompanyPlatform                     ← layout for company internal roles
│   ├── /dashboard
│   ├── /job-postings
│   ├── /candidates
│   ├── /pipeline
│   └── /interviews
├── SuperAdminPlatform              ← layout for SuperAdmin
│   └── /platform/companies
└── CandidatePlatform               ← layout for Candidate
    ├── /candidate/dashboard
    ├── /candidate/applications
    ├── /candidate/bookmarks
    └── /candidate/settings
```

## Platform Layouts

### CompanyPlatform (was `AppShell`)
- **File:** `frontend/src/app/CompanyPlatform.tsx`
- **Route parent for:** CompanyAdmin, Recruiter, HiringManager, Interviewer
- **Layout:** Mantine `AppShell` with header (brand + role badge + logout) and sidebar (Dashboard, Job Postings, Candidates, Pipeline, Interviews)
- **Auth gate:** Renders only for authenticated users with role != Candidate and != SuperAdmin (enforced by route-level guards, not component-level)

### SuperAdminPlatform (new)
- **File:** `frontend/src/app/SuperAdminPlatform.tsx`
- **Route parent for:** SuperAdmin
- **Layout:** Mantine `AppShell` with header (brand + logout) and sidebar — initially only "Companies" nav item
- **Default route:** `/platform/companies`

### CandidatePlatform (was `CandidateShell`)
- **File:** `frontend/src/shared/components/CandidatePlatform.tsx`
- **Route parent for:** Candidate
- **Layout:** Minimal chrome — top nav with Jobs, Applications, Bookmarks, Settings + Logout
- **No sidebar**

## Auth Redirect Logic

Shared `redirectToDashboard()` function used in `beforeLoad` on `/login` and `/signup` routes:

```
if not authenticated → return (allow access)
if role === 'Candidate' → redirect to /candidate/dashboard
if role === 'SuperAdmin' → redirect to /platform/companies
else → redirect to /dashboard
```

## File Changes

| Action | Path |
|--------|------|
| Rename | `frontend/src/app/AppShell.tsx` → `CompanyPlatform.tsx` |
| Rename | `frontend/src/shared/components/CandidateShell.tsx` → `CandidatePlatform.tsx` |
| Create | `frontend/src/app/SuperAdminPlatform.tsx` |
| Create | `frontend/src/features/admin/CompaniesPage.tsx` (placeholder) |
| Modify | `frontend/src/app/router.tsx` — restructure routes, add SuperAdminPlatform, update guards |
| Update | `frontend/src/app/providers.tsx` — update import if needed |
| Update | All files importing `AppShell` or `CandidateShell` |

## Future Considerations

- Role-based component filtering within CompanyPlatform (e.g., Interviewer sees only interview-related sidebar items)
- Platform-wide stats page for SuperAdmin
- Audit log viewer for SuperAdmin
- Company detail page (view/suspend/reactivate)
