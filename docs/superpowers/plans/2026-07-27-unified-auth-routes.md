# Unified Auth Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all authentication behind `/auth/signin`, restructure frontend routes with role-based dashboards at `/`, `/org/`, and `/admin/` prefixes.

**Architecture:** Backend consolidates four auth endpoints into three: `/auth/signin` (unified login), `/auth/signup` (candidate registration), `/auth/org/signup` (tenant registration). Frontend routes move from `/login` → `/auth/signin`, `/candidate/*` → root-level routes, `/dashboard` → `/org/dashboard` for org users, and `/platform/tenants` → `/admin/tenants` for SuperAdmin. Route guards enforce strict role isolation.

**Tech Stack:** NestJS 11, Drizzle ORM, TanStack Router v1 (file-based), React 19, Mantine 9, Zustand 5

## Global Constraints

- Use TanStack Router file-based routing conventions (dot-separated flat file names)
- Backend 404 for cross-tenant resource access (not 403)
- JWT payloads include `role` and optionally `tenantId`
- All route guard logic uses `beforeLoad` in route files
- No changes to database schema or tenant isolation logic

---

### Task 1: Backend — Restructure auth endpoints

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`

**Interfaces:**
- Consumes: existing `AuthService` methods (login, signup, candidateSignup, candidateLogin)
- Produces: `POST /auth/signin` (unified), `POST /auth/signup` (candidate), `POST /auth/org/signup` (tenant)

- [ ] **Step 1: Update auth.controller.ts — restructure endpoints**

```typescript
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { CandidateSignupDto } from './dto/candidate-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('org/signup')
  async orgSignup(
    @Body()
    dto: {
      companyName: string;
      slug: string;
      email: string;
      password: string;
    },
  ) {
    return this.authService.orgSignup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(@Body() dto: { email: string; password: string }) {
    return this.authService.signin(dto);
  }

  @Post('signup')
  async signup(@Body() dto: CandidateSignupDto) {
    return this.authService.candidateSignup(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.userId);
    return { message: 'Logged out' };
  }
}
```

- [ ] **Step 2: Update auth.service.ts — rename `signup` → `orgSignup`, add unified `signin`**

Change the `signup` method name to `orgSignup`:

```typescript
  async orgSignup(dto: {
    companyName: string;
    slug: string;
    email: string;
    password: string;
  }) {
    // ... same body as current signup()
  }
```

Add unified `signin` that replaces both `login` and `candidateLogin`:

```typescript
  async signin(dto: { email: string; password: string }) {
    // First: try org user login
    const { db: pubDb, release } = await this.drizzleSchema.forPublic();
    let emailRecord: { tenantId: string; userId: string } | null = null;
    try {
      const records = await pubDb
        .select()
        .from(userEmails)
        .where(eq(userEmails.email, dto.email))
        .execute();
      if (records.length > 0) {
        emailRecord = records[0];
      }
    } finally {
      release();
    }

    if (emailRecord) {
      // Org user login flow
      const { db: tenantDb, release: tenantRelease } =
        await this.drizzleSchema.forSchema(`tenant_${emailRecord.tenantId}`);
      try {
        const userResult = await tenantDb
          .select()
          .from(users)
          .where(eq(users.email, dto.email))
          .execute();
        if (userResult.length === 0)
          throw new UnauthorizedException('Invalid credentials');
        const user = userResult[0];
        const valid = await verifyPassword(user.passwordHash, dto.password);
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        return this.generateTokens(user.id, emailRecord.tenantId, user.role);
      } finally {
        tenantRelease();
      }
    }

    // Fallback: try candidate login
    const account = await this.candidateAccountRepo.findByEmail(dto.email);
    if (!account) throw new UnauthorizedException('Invalid credentials');

    const valid = await verifyPassword(account.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.generateCandidateTokens(account.id);
  }
```

Remove the old `login()` and `candidateLogin()` methods entirely.

**Important:** The existing `signup` method and the DTO import for `CandidateLoginDto` should be removed. Keep `CandidateSignupDto`.

- [ ] **Step 3: Run typecheck and lint**

Run: `cd backend && npm run typecheck && npm run lint`
Expected: No type/lint errors from the refactored code.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.service.ts
git commit -m "feat(auth): unify signin, rename signup -> org/signup"
```

---

### Task 2: Frontend — Update useAuthStore

**Files:**
- Modify: `frontend/src/shared/api/useAuth.ts`

**Interfaces:**
- Consumes: new backend endpoints (`/auth/signin`, `/auth/signup`, `/auth/org/signup`)
- Produces: store methods `signin()`, `candidateSignup()`, `orgSignup()`

- [ ] **Step 1: Update store — add `signin`, `candidateSignup`, `orgSignup`**

Replace the existing `login` and `signup` methods with new ones:

```typescript
  signin: async (email: string, password: string) => {
    const { data } = await api.post('/auth/signin', { email, password });
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('userId', payload.sub);
    if (payload.tenantId) {
      localStorage.setItem('tenantId', payload.tenantId);
    } else {
      localStorage.removeItem('tenantId');
    }
    localStorage.setItem('role', payload.role);
    set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: payload.sub,
      tenantId: payload.tenantId ?? null,
      role: payload.role,
    });
  },

  candidateSignup: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => {
    const { data: res } = await api.post('/auth/signup', data);
    const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.removeItem('tenantId');
    localStorage.setItem('role', payload.role);
    set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      userId: payload.sub,
      tenantId: null,
      role: payload.role,
    });
  },

  orgSignup: async (data: {
    companyName: string;
    slug: string;
    email: string;
    password: string;
  }) => {
    const { data: res } = await api.post('/auth/org/signup', data);
    const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.setItem('tenantId', payload.tenantId);
    localStorage.setItem('role', payload.role);
    set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    });
  },
```

Remove the old `login` and `signup` methods from the `AuthState` interface and store creator.

- [ ] **Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/api/useAuth.ts
git commit -m "feat(auth): update store with signin/candidateSignup/orgSignup"
```

---

### Task 3: Frontend — Create SignInPage and OrgSignupPage components

**Files:**
- Create: `frontend/src/features/auth/SignInPage.tsx`
- Create: `frontend/src/features/auth/OrgSignupPage.tsx`
- Delete: `frontend/src/features/auth/LoginPage.tsx`
- Delete: `frontend/src/features/auth/SignupPage.tsx`
- Delete: `frontend/src/features/candidate/login/LoginPage.tsx`
- Modify: `frontend/src/features/candidate/signup/SignupPage.tsx`

- [ ] **Step 1: Create `frontend/src/features/auth/SignInPage.tsx`**

```typescript
import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useAuthStore } from '../../shared/api/useAuth';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const signin = useAuthStore((s) => s.signin);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await signin(email, password);
      const role = useAuthStore.getState().role;
      if (role === 'Candidate') {
        navigate({ to: '/dashboard' });
      } else if (role === 'SuperAdmin') {
        navigate({ to: '/admin/tenants' });
      } else {
        navigate({ to: '/org/dashboard' });
      }
    } catch {
      setError('Invalid email or password');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Welcome back</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="Email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button fullWidth mt="xl" type="submit">Sign in</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Don't have an account? <Link to="/auth/signup">Sign up as candidate</Link>
        </Text>
        <Text c="dimmed" size="sm" ta="center" mt="xs">
          <Link to="/auth/org/signup">Create a company account</Link>
        </Text>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 2: Create `frontend/src/features/auth/OrgSignupPage.tsx`**

```typescript
import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useAuthStore } from '../../shared/api/useAuth';

export function OrgSignupPage() {
  const [form, setForm] = useState({ companyName: '', slug: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const orgSignup = useAuthStore((s) => s.orgSignup);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await orgSignup({ companyName: form.companyName, slug: form.slug, email: form.email, password: form.password });
      navigate({ to: '/auth/signin' });
    } catch {
      setError('Signup failed');
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Container size={420} my={40}>
      <Title ta="center">Create your company</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleSubmit}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="Company name" placeholder="Acme Inc" required value={form.companyName} onChange={update('companyName')} />
          <TextInput label="Company slug" placeholder="acme" required mt="md" value={form.slug} onChange={update('slug')} />
          <TextInput label="Email" placeholder="you@company.com" required mt="md" value={form.email} onChange={update('email')} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" value={form.password} onChange={update('password')} />
          <PasswordInput label="Confirm password" placeholder="Confirm password" required mt="md" value={form.confirmPassword} onChange={update('confirmPassword')} />
          <Button fullWidth mt="xl" type="submit">Create account</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Already have an account? <Link to="/auth/signin">Sign in</Link>
        </Text>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 3: Delete old LoginPage and SignupPage components**

Remove:
- `frontend/src/features/auth/LoginPage.tsx`
- `frontend/src/features/auth/SignupPage.tsx`
- `frontend/src/features/candidate/login/LoginPage.tsx`

- [ ] **Step 4: Update candidate signup page links and store usage**

Replace content of `frontend/src/features/candidate/signup/SignupPage.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useAuthStore } from '../../../shared/api/useAuth';

export function CandidateSignupPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const candidateSignup = useAuthStore((s) => s.candidateSignup);

  const form = useForm({
    initialValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setError('');
    if (values.password !== values.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await candidateSignup({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      });
      navigate({ to: '/dashboard' });
    } catch {
      setError('Signup failed');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Create your account</Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          {error && <Alert color="red" mb="md">{error}</Alert>}
          <TextInput label="First name" placeholder="John" required {...form.getInputProps('firstName')} />
          <TextInput label="Last name" placeholder="Doe" required mt="md" {...form.getInputProps('lastName')} />
          <TextInput label="Email" placeholder="you@example.com" required mt="md" {...form.getInputProps('email')} />
          <PasswordInput label="Password" placeholder="Your password" required mt="md" {...form.getInputProps('password')} />
          <PasswordInput label="Confirm password" placeholder="Confirm password" required mt="md" {...form.getInputProps('confirmPassword')} />
          <Button fullWidth mt="xl" type="submit">Create account</Button>
        </form>
        <Text c="dimmed" size="sm" ta="center" mt="md">
          Already have an account? <Link to="/auth/signin">Sign in</Link>
        </Text>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 5: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auth/SignInPage.tsx frontend/src/features/auth/OrgSignupPage.tsx frontend/src/features/candidate/signup/SignupPage.tsx
git rm frontend/src/features/auth/LoginPage.tsx frontend/src/features/auth/SignupPage.tsx frontend/src/features/candidate/login/LoginPage.tsx
git commit -m "feat(auth): create SignInPage, OrgSignupPage, update candidate signup"
```

---

### Task 4: Frontend — Create new auth route files

**Files:**
- Create: `frontend/src/routes/auth.signin.tsx`
- Create: `frontend/src/routes/auth.signup.tsx`
- Create: `frontend/src/routes/auth.org.signup.tsx`
- Delete: `frontend/src/routes/login.tsx`
- Delete: `frontend/src/routes/signup.tsx`
- Delete: `frontend/src/routes/_candidate.candidate.login.tsx`
- Delete: `frontend/src/routes/_candidate.candidate.signup.tsx`

- [ ] **Step 1: Create `frontend/src/routes/auth.signin.tsx`**

```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignInPage } from '../features/auth/SignInPage';
import { useAuthStore } from '../shared/api/useAuth';

function redirectToDashboard() {
  const { role, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated()) return;
  if (role === 'Candidate') {
    throw redirect({ to: '/dashboard' });
  }
  if (role === 'SuperAdmin') {
    throw redirect({ to: '/admin/tenants' });
  }
  throw redirect({ to: '/org/dashboard' });
}

export const Route = createFileRoute('/auth/signin')({
  beforeLoad: redirectToDashboard,
  component: SignInPage,
});
```

- [ ] **Step 2: Create `frontend/src/routes/auth.signup.tsx`**

```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/auth/signup')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: CandidateSignupPage,
});
```

- [ ] **Step 3: Create `frontend/src/routes/auth.org.signup.tsx`**

```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';
import { OrgSignupPage } from '../features/auth/OrgSignupPage';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/auth/org/signup')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      const { role } = useAuthStore.getState();
      if (role === 'Candidate') throw redirect({ to: '/dashboard' });
      if (role === 'SuperAdmin') throw redirect({ to: '/admin/tenants' });
      throw redirect({ to: '/org/dashboard' });
    }
  },
  component: OrgSignupPage,
});
```

- [ ] **Step 4: Delete old route files**

Remove these four files:
- `frontend/src/routes/login.tsx`
- `frontend/src/routes/signup.tsx`
- `frontend/src/routes/_candidate.candidate.login.tsx`
- `frontend/src/routes/_candidate.candidate.signup.tsx`

- [ ] **Step 5: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/auth.signin.tsx frontend/src/routes/auth.signup.tsx frontend/src/routes/auth.org.signup.tsx
git rm frontend/src/routes/login.tsx frontend/src/routes/signup.tsx frontend/src/routes/_candidate.candidate.login.tsx frontend/src/routes/_candidate.candidate.signup.tsx
git commit -m "feat(auth): add auth route files under /auth/"
```

---

### Task 5: Frontend — Move candidate routes to root level

**Files:**
- Rename: `frontend/src/routes/_candidate.candidate.dashboard.tsx` → `frontend/src/routes/_candidate.dashboard.tsx`
- Rename: `frontend/src/routes/_candidate.candidate.applications.tsx` → `frontend/src/routes/_candidate.applications.tsx`
- Rename: `frontend/src/routes/_candidate.candidate.bookmarks.tsx` → `frontend/src/routes/_candidate.bookmarks.tsx`
- Rename: `frontend/src/routes/_candidate.candidate.settings.tsx` → `frontend/src/routes/_candidate.settings.tsx`
- Modify: `frontend/src/shared/components/CandidatePlatform.tsx`

- [ ] **Step 1: Rename candidate route files**

Use `git mv` for each:
```bash
git mv frontend/src/routes/_candidate.candidate.dashboard.tsx frontend/src/routes/_candidate.dashboard.tsx
git mv frontend/src/routes/_candidate.candidate.applications.tsx frontend/src/routes/_candidate.applications.tsx
git mv frontend/src/routes/_candidate.candidate.bookmarks.tsx frontend/src/routes/_candidate.bookmarks.tsx
git mv frontend/src/routes/_candidate.candidate.settings.tsx frontend/src/routes/_candidate.settings.tsx
```

- [ ] **Step 2: Update each renamed route file to reflect new path segment**

Each file's `createFileRoute` call uses the old path (e.g. `'/_candidate/candidate/dashboard'`). Rename automatically changes the file name, but the route string literal inside each file needs updating too.

**`_candidate.dashboard.tsx`:**
```typescript
import { createFileRoute } from '@tanstack/react-router';
import { JobSearchPage } from '../features/candidate/dashboard/JobSearchPage';

export const Route = createFileRoute('/_candidate/dashboard')({
  component: JobSearchPage,
});
```

**`_candidate.applications.tsx`:**
```typescript
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationsPage } from '../features/candidate/applications/ApplicationsPage';

export const Route = createFileRoute('/_candidate/applications')({
  component: ApplicationsPage,
});
```

**`_candidate.bookmarks.tsx`:**
```typescript
import { createFileRoute } from '@tanstack/react-router';
import { BookmarksPage } from '../features/candidate/bookmarks/BookmarksPage';

export const Route = createFileRoute('/_candidate/bookmarks')({
  component: BookmarksPage,
});
```

**`_candidate.settings.tsx`:**
```typescript
import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '../features/candidate/settings/SettingsPage';

export const Route = createFileRoute('/_candidate/settings')({
  component: SettingsPage,
});
```

- [ ] **Step 3: Update CandidatePlatform nav links and logout**

Replace the content of `frontend/src/shared/components/CandidatePlatform.tsx`:

```typescript
import { Container, Group, Title, Anchor, Button } from '@mantine/core';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../api/useAuth';

export function CandidatePlatform() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  if (role !== 'Candidate') {
    return null; // will be handled by route guards
  }

  return (
    <>
      <Group p="md" style={{ borderBottom: '1px solid #eee' }}>
        <Title order={3}>TalentPipe</Title>
        <Anchor onClick={() => navigate({ to: '/dashboard' })}>Jobs</Anchor>
        <Anchor onClick={() => navigate({ to: '/applications' })}>Applications</Anchor>
        <Anchor onClick={() => navigate({ to: '/bookmarks' })}>Bookmarks</Anchor>
        <Anchor onClick={() => navigate({ to: '/settings' })}>Settings</Anchor>
        <Button variant="subtle" onClick={() => { logout(); navigate({ to: '/auth/signin' }); }}>Logout</Button>
      </Group>
      <Container size="lg" py="xl">
        <Outlet />
      </Container>
    </>
  );
}
```

- [ ] **Step 4: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/ frontend/src/shared/components/CandidatePlatform.tsx
git commit -m "feat(auth): move candidate routes to root level"
```

---

### Task 6: Frontend — Move org routes to `/org/` prefix

**Files:**
- Rename: `frontend/src/routes/_org.tsx` → `frontend/src/routes/org.tsx`
- Rename: `frontend/src/routes/_org.dashboard.tsx` → `frontend/src/routes/org.dashboard.tsx`
- Modify: `frontend/src/app/OrgPlatform.tsx`

- [ ] **Step 1: Rename org route files**

```bash
git mv frontend/src/routes/_org.tsx frontend/src/routes/org.tsx
git mv frontend/src/routes/_org.dashboard.tsx frontend/src/routes/org.dashboard.tsx
```

- [ ] **Step 2: Update route string in `org.dashboard.tsx`**

```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/org/dashboard')({
  component: () => <div>Dashboard</div>,
});
```

- [ ] **Step 3: Update `org.tsx` import path**

The file currently imports from `'../app/OrgPlatform'` — update to reflect new relative path if needed. The route string changes from `/_org` to `/org`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { OrgPlatform } from '../app/OrgPlatform';

export const Route = createFileRoute('/org')({
  component: OrgPlatform,
});
```

- [ ] **Step 4: Update OrgPlatform.tsx — add `/org/` prefix to nav links, fix logout**

```typescript
const navItems = [
    { label: 'Dashboard', icon: IconDashboard, to: '/org/dashboard' },
    { label: 'Job Postings', icon: IconBriefcase, to: '/org/job-postings' },
    { label: 'Candidates', icon: IconUsers, to: '/org/candidates' },
    { label: 'Pipeline', icon: IconLayoutKanban, to: '/org/pipeline' },
    { label: 'Interviews', icon: IconCalendarEvent, to: '/org/interviews' },
  ];
```

Change the logout redirect:
```typescript
  const handleLogout = () => {
    logout();
    navigate({ to: '/auth/signin' });
  };
```

- [ ] **Step 5: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/org.tsx frontend/src/routes/org.dashboard.tsx frontend/src/app/OrgPlatform.tsx
git rm frontend/src/routes/_org.tsx frontend/src/routes/_org.dashboard.tsx
git commit -m "feat(auth): move org routes to /org/ prefix"
```

---

### Task 7: Frontend — Move super-admin routes to `/admin/` prefix

**Files:**
- Rename: `frontend/src/routes/_super-admin.tsx` → `frontend/src/routes/admin.tsx`
- Rename: `frontend/src/routes/_super-admin.platform.tenants.tsx` → `frontend/src/routes/admin.tenants.tsx`
- Modify: `frontend/src/app/SuperAdminPlatform.tsx`

- [ ] **Step 1: Rename super-admin route files**

```bash
git mv frontend/src/routes/_super-admin.tsx frontend/src/routes/admin.tsx
git mv frontend/src/routes/_super-admin.platform.tenants.tsx frontend/src/routes/admin.tenants.tsx
```

- [ ] **Step 2: Update route string in `admin.tenants.tsx`**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { TenantsPage } from '../features/admin/TenantsPage';

export const Route = createFileRoute('/admin/tenants')({
  component: TenantsPage,
});
```

- [ ] **Step 3: Update `admin.tsx`**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { SuperAdminPlatform } from '../app/SuperAdminPlatform';

export const Route = createFileRoute('/admin')({
  component: SuperAdminPlatform,
});
```

- [ ] **Step 4: Update SuperAdminPlatform.tsx nav link and logout**

```typescript
import { IconBuildingEstate } from '@tabler/icons-react';

// inside component:
const handleLogout = () => {
    logout();
    navigate({ to: '/auth/signin' });
  };
```

Change nav link:
```typescript
<NavLink
  label="Tenants"
  leftSection={<IconBuildingEstate size="1rem" />}
  component={Link}
  to="/admin/tenants"
/>
```

- [ ] **Step 5: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/admin.tsx frontend/src/routes/admin.tenants.tsx frontend/src/app/SuperAdminPlatform.tsx
git rm frontend/src/routes/_super-admin.tsx frontend/src/routes/_super-admin.platform.tenants.tsx
git commit -m "feat(auth): move super-admin routes to /admin/ prefix"
```

### Task 8: Frontend — Update root index and regenerate route tree

**Files:**
- Modify: `frontend/src/routes/index.tsx`

- [ ] **Step 1: Update root `index.tsx` redirects**

```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const { role, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated()) {
      throw redirect({ to: '/auth/signin' });
    }
    if (role === 'Candidate') {
      throw redirect({ to: '/dashboard' });
    }
    if (role === 'SuperAdmin') {
      throw redirect({ to: '/admin/tenants' });
    }
    throw redirect({ to: '/org/dashboard' });
  },
});
```

- [ ] **Step 2: Regenerate route tree**

Run: `cd frontend && npm run build`
(Or the route tree generation command — TanStack Router auto-generates `routeTree.gen.ts` during build)

If there's a separate generate command, use `npx @tanstack/react-router-cli generate`.

- [ ] **Step 3: Full frontend typecheck**

Run: `cd frontend && npm run build`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/index.tsx
git commit -m "feat(auth): update root redirects for new route structure"
```

---

### Task 9: Update API documentation

**Files:**
- Modify: `docs/07_API_ENDPOINT_DOCUMENTATION.md`

- [ ] **Step 1: Update auth routes table**

Change the auth section to reflect new endpoints:

```markdown
| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/signin` | PUBLIC | Unified sign-in — accepts email+password, routes to org or candidate auth based on account type |
| POST | `/auth/signup` | PUBLIC | Creates a new candidate account (email, password, name) |
| POST | `/auth/org/signup` | PUBLIC | Creates a new Tenant + first Org Admin user |
| POST | `/auth/refresh` | PUBLIC | Exchanges refresh token for new access token |
| POST | `/auth/logout` | — | Revokes current refresh token |
```

Remove the old `/auth/login`, `/auth/candidate/login`, `/auth/candidate/signup` rows.

- [ ] **Step 2: Commit**

```bash
git add docs/07_API_ENDPOINT_DOCUMENTATION.md
git commit -m "docs: update API documentation for unified auth routes"
```
