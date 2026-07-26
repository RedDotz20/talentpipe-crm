import { createRouter, Route, RootRoute } from '@tanstack/react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { AppShell } from './AppShell';
import { CandidateShell } from '../shared/components/CandidateShell';
import { CandidateLoginPage } from '../features/candidate/login/LoginPage';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';
import { JobSearchPage } from '../features/candidate/dashboard/JobSearchPage';
import { ApplicationsPage } from '../features/candidate/applications/ApplicationsPage';
import { BookmarksPage } from '../features/candidate/bookmarks/BookmarksPage';
import { SettingsPage } from '../features/candidate/settings/SettingsPage';

import { Link } from '@tanstack/react-router';
import { Container, Title, Text, Button } from '@mantine/core';

const rootRoute = new RootRoute({
  component: AppShell,
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

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const signupRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/signup',
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
  component: CandidateLoginPage,
});

const candidateSignupRoute = new Route({
  getParentRoute: () => candidateLayoutRoute,
  path: '/candidate/signup',
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
