# Three-Dashboard Platform Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure frontend routing into three role-based platform layouts with proper auth guards and naming.

**Architecture:** Rename existing layouts (`AppShell` → `CompanyPlatform`, `CandidateShell` → `CandidatePlatform`), create new `SuperAdminPlatform` layout, restructure `router.tsx` to nest routes under the correct platform with `beforeLoad` guards checking `role` from auth store.

**Tech Stack:** React 19, Mantine 9, TanStack Router 1, Zustand 5

---

### Task 1: Rename AppShell → CompanyPlatform

**Files:**
- Rename: `frontend/src/app/AppShell.tsx` → `frontend/src/app/CompanyPlatform.tsx`
- Update: `frontend/src/app/CompanyPlatform.tsx` (rename export + Mantine import alias)
- Update: `frontend/src/app/router.tsx:4` (update import)

- [ ] **Step 1: Rename the file**

```bash
cd frontend/src/app && Move-Item -LiteralPath "AppShell.tsx" -Destination "CompanyPlatform.tsx"
```

- [ ] **Step 2: Update component name and import alias**

In `frontend/src/app/CompanyPlatform.tsx`, change:
```tsx
import { AppShell as MantineShell, Group, Text, Button, NavLink } from '@mantine/core';
...
export function AppShell() {
```

To:
```tsx
import { AppShell as MantineShell, Group, Text, Button, NavLink } from '@mantine/core';
...
export function CompanyPlatform() {
```

- [ ] **Step 3: Update import in router.tsx**

In `frontend/src/app/router.tsx:4`, change:
```tsx
import { AppShell } from './AppShell';
```
To:
```tsx
import { CompanyPlatform } from './CompanyPlatform';
```

- [ ] **Step 4: Update rootRoute reference**

In `frontend/src/app/router.tsx:18`, change:
```tsx
component: AppShell,
```
To:
```tsx
component: CompanyPlatform,
```

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds with no errors (only chunk size warning).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/AppShell.tsx frontend/src/app/CompanyPlatform.tsx frontend/src/app/router.tsx
git commit -m "feat(frontend): rename AppShell to CompanyPlatform"
```

---

### Task 2: Rename CandidateShell → CandidatePlatform

**Files:**
- Rename: `frontend/src/shared/components/CandidateShell.tsx` → `frontend/src/shared/components/CandidatePlatform.tsx`
- Update: `frontend/src/shared/components/CandidatePlatform.tsx` (rename export)
- Update: `frontend/src/app/router.tsx:5` (update import)
- Update: `frontend/src/app/router.tsx:31` (update component reference)

- [ ] **Step 1: Rename the file**

```bash
cd frontend/src/shared/components && Move-Item -LiteralPath "CandidateShell.tsx" -Destination "CandidatePlatform.tsx"
```

- [ ] **Step 2: Update component name**

In `frontend/src/shared/components/CandidatePlatform.tsx:5`, change:
```tsx
export function CandidateShell() {
```
To:
```tsx
export function CandidatePlatform() {
```

- [ ] **Step 3: Update import in router.tsx**

In `frontend/src/app/router.tsx:5`, change:
```tsx
import { CandidateShell } from '../shared/components/CandidateShell';
```
To:
```tsx
import { CandidatePlatform } from '../shared/components/CandidatePlatform';
```

- [ ] **Step 4: Update route component reference**

In `frontend/src/app/router.tsx:31`, change:
```tsx
component: CandidateShell,
```
To:
```tsx
component: CandidatePlatform,
```

- [ ] **Step 5: Verify build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/components/CandidateShell.tsx frontend/src/shared/components/CandidatePlatform.tsx frontend/src/app/router.tsx
git commit -m "feat(frontend): rename CandidateShell to CandidatePlatform"
```

---

### Task 3: Create SuperAdminPlatform layout

**Files:**
- Create: `frontend/src/app/SuperAdminPlatform.tsx`

- [ ] **Step 1: Create SuperAdminPlatform.tsx**

```tsx
import { Outlet, Link, useNavigate } from '@tanstack/react-router';
import { AppShell as MantineShell, Group, Text, Button, NavLink } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBuildingEstate } from '@tabler/icons-react';
import { useAuthStore } from '../shared/api/useAuth';

export function SuperAdminPlatform() {
  const [opened] = useDisclosure();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  return (
    <MantineShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <MantineShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>TalentPipe</Text>
          <Button variant="outline" size="xs" onClick={handleLogout}>Logout</Button>
        </Group>
      </MantineShell.Header>

      <MantineShell.Navbar p="xs">
        <NavLink
          label="Companies"
          leftSection={<IconBuildingEstate size="1rem" />}
          component={Link}
          to="/platform/companies"
        />
      </MantineShell.Navbar>

      <MantineShell.Main>
        <Outlet />
      </MantineShell.Main>
    </MantineShell>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/SuperAdminPlatform.tsx
git commit -m "feat(frontend): create SuperAdminPlatform layout"
```

---

### Task 4: Create CompaniesPage placeholder

**Files:**
- Remove: `frontend/src/features/admin/.gitkeep`
- Create: `frontend/src/features/admin/CompaniesPage.tsx`

- [ ] **Step 1: Remove .gitkeep and create CompaniesPage.tsx**

```bash
Remove-Item -LiteralPath "frontend/src/features/admin/.gitkeep"
```

```tsx
import { Container, Title } from '@mantine/core';

export function CompaniesPage() {
  return (
    <Container>
      <Title>Companies</Title>
    </Container>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/.gitkeep frontend/src/features/admin/CompaniesPage.tsx
git commit -m "feat(frontend): add CompaniesPage placeholder"
```

---

### Task 5: Restructure router.tsx with role-based platforms

**Files:**
- Modify: `frontend/src/app/router.tsx`

- [ ] **Step 1: Rewrite router.tsx**

Replace the entire file content with the restructured route tree:

```tsx
import { createRouter, Route, RootRoute, redirect } from '@tanstack/react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { CompanyPlatform } from './CompanyPlatform';
import { SuperAdminPlatform } from './SuperAdminPlatform';
import { CandidatePlatform } from '../shared/components/CandidatePlatform';
import { CandidateLoginPage } from '../features/candidate/login/LoginPage';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';
import { JobSearchPage } from '../features/candidate/dashboard/JobSearchPage';
import { ApplicationsPage } from '../features/candidate/applications/ApplicationsPage';
import { BookmarksPage } from '../features/candidate/bookmarks/BookmarksPage';
import { SettingsPage } from '../features/candidate/settings/SettingsPage';
import { CompaniesPage } from '../features/admin/CompaniesPage';
import { useAuthStore } from '../shared/api/useAuth';

import { Link } from '@tanstack/react-router';
import { Container, Title, Text, Button } from '@mantine/core';

function redirectToDashboard() {
  const { role, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated()) return;
  if (role === 'Candidate') {
    throw redirect({ to: '/candidate/dashboard' });
  }
  if (role === 'SuperAdmin') {
    throw redirect({ to: '/platform/companies' });
  }
  throw redirect({ to: '/dashboard' });
}

const rootRoute = new RootRoute({
  notFoundComponent: () => (
    <Container ta="center" py="xl">
      <Title>404</Title>
      <Text c="dimmed" mb="lg">Page not found</Text>
      <Button component={Link} to="/dashboard">Go home</Button>
    </Container>
  ),
});

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: redirectToDashboard,
  component: LoginPage,
});

const signupRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/signup',
  beforeLoad: redirectToDashboard,
  component: SignupPage,
});

// ── Company Platform (CompanyAdmin, Recruiter, HiringManager, Interviewer) ──

const companyLayoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'company',
  component: CompanyPlatform,
});

const companyDashboardRoute = new Route({
  getParentRoute: () => companyLayoutRoute,
  path: '/dashboard',
  component: () => <div>Dashboard</div>,
});

// TODO: add /job-postings, /candidates, /pipeline, /interviews as children of companyLayoutRoute
// when those features are built

// ── SuperAdmin Platform ──

const superAdminLayoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'super-admin',
  component: SuperAdminPlatform,
});

const companiesRoute = new Route({
  getParentRoute: () => superAdminLayoutRoute,
  path: '/platform/companies',
  component: CompaniesPage,
});

// ── Candidate Platform ──

const candidateLayoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'candidate',
  component: CandidatePlatform,
});

const candidateLoginRoute = new Route({
  getParentRoute: () => candidateLayoutRoute,
  path: '/candidate/login',
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/candidate/dashboard' });
    }
  },
  component: CandidateLoginPage,
});

const candidateSignupRoute = new Route({
  getParentRoute: () => candidateLayoutRoute,
  path: '/candidate/signup',
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/candidate/dashboard' });
    }
  },
  component: CandidateSignupPage,
});

const candidateDashboardRoute = new Route({
  getParentRoute: () => candidateLayoutRoute,
  path: '/candidate/dashboard',
  component: JobSearchPage,
});

const candidateApplicationsRoute = new Route({
  getParentRoute: () => candidateLayoutRoute,
  path: '/candidate/applications',
  component: ApplicationsPage,
});

const candidateBookmarksRoute = new Route({
  getParentRoute: () => candidateLayoutRoute,
  path: '/candidate/bookmarks',
  component: BookmarksPage,
});

const candidateSettingsRoute = new Route({
  getParentRoute: () => candidateLayoutRoute,
  path: '/candidate/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute, signupRoute,
  companyLayoutRoute.addChildren([companyDashboardRoute]),
  superAdminLayoutRoute.addChildren([companiesRoute]),
  candidateLayoutRoute.addChildren([
    candidateLoginRoute, candidateSignupRoute, candidateDashboardRoute,
    candidateApplicationsRoute, candidateBookmarksRoute, candidateSettingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/router.tsx
git commit -m "feat(frontend): restructure routes into role-based platforms"
```

---

### Task 6: Clean up stale files

**Files:**
- Delete: `frontend/src/shared/components/CandidateShell.tsx` (if rename didn't delete it)
- Delete: `frontend/src/app/AppShell.tsx` (if rename didn't delete it)

- [ ] **Step 1: Verify no stale files remain**

```bash
Get-ChildItem -Path frontend/src -Recurse -Filter "AppShell.tsx"
Get-ChildItem -Path frontend/src -Recurse -Filter "CandidateShell.tsx"
```
Expected: No files found.

- [ ] **Step 2: Final build verification**

```bash
cd frontend && npm run build && npm run lint
```
Expected: Build succeeds, lint passes (only pre-existing warnings).

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: clean up renamed layout files"
```
