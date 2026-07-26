import { createRouter, Route, RootRoute, redirect } from '@tanstack/react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { OrgPlatform } from './OrgPlatform';
import { CandidateShell } from '../shared/components/CandidateShell';
import { CandidateLoginPage } from '../features/candidate/login/LoginPage';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';
import { JobSearchPage } from '../features/candidate/dashboard/JobSearchPage';
import { ApplicationsPage } from '../features/candidate/applications/ApplicationsPage';
import { BookmarksPage } from '../features/candidate/bookmarks/BookmarksPage';
import { SettingsPage } from '../features/candidate/settings/SettingsPage';
import { useAuthStore } from '../shared/api/useAuth';

import { Link } from '@tanstack/react-router';
import { Container, Title, Text, Button } from '@mantine/core';

const rootRoute = new RootRoute({
  component: OrgPlatform,
  notFoundComponent: () => (
    <Container ta="center" py="xl">
      <Title>404</Title>
      <Text c="dimmed" mb="lg">Page not found</Text>
      <Button component={Link} to="/dashboard">Go home</Button>
    </Container>
  ),
});

const candidateLayoutRoute = new Route({
  getParentRoute: () => rootRoute,
  id: 'candidate',
  component: CandidateShell,
});

function redirectToDashboard() {
  const { role, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated()) return;
  if (role === 'Candidate') {
    throw redirect({ to: '/candidate/dashboard' });
  }
  throw redirect({ to: '/dashboard' });
}

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

const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => <div>Dashboard</div>,
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
  loginRoute, signupRoute, dashboardRoute,
  candidateLayoutRoute.addChildren([
    candidateLoginRoute, candidateSignupRoute, candidateDashboardRoute, candidateApplicationsRoute, candidateBookmarksRoute, candidateSettingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });
