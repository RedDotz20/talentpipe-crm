import { createRouter, Route, RootRoute } from '@tanstack/react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { AppShell } from './AppShell';
import { CandidateShell } from '../shared/components/CandidateShell';
import { CandidateLoginPage } from '../features/candidate/login/LoginPage';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';

const rootRoute = new RootRoute({
  component: AppShell,
});

const candidateRootRoute = new RootRoute({
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
  getParentRoute: () => candidateRootRoute,
  path: '/candidate/login',
  component: CandidateLoginPage,
});

const candidateSignupRoute = new Route({
  getParentRoute: () => candidateRootRoute,
  path: '/candidate/signup',
  component: CandidateSignupPage,
});

const candidateDashboardRoute = new Route({
  getParentRoute: () => candidateRootRoute,
  path: '/candidate/dashboard',
  component: () => <div>Candidate Dashboard</div>,
});

const routeTree = rootRoute.addChildren([
  loginRoute, signupRoute, dashboardRoute,
  candidateRootRoute.addChildren([
    candidateLoginRoute, candidateSignupRoute, candidateDashboardRoute,
  ]),
]);

export const router = createRouter({ routeTree });
