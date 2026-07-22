import { createRouter, Route, RootRoute } from '@tanstack/react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { SignupPage } from '../features/auth/SignupPage';
import { AppShell } from './AppShell';

const rootRoute = new RootRoute({
  component: AppShell,
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

const routeTree = rootRoute.addChildren([loginRoute, signupRoute, dashboardRoute]);

export const router = createRouter({ routeTree });
