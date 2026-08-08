import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignInPage } from '@/features/auth/SignInPage';
import { useAuthStore } from '@/api/useAuth';
import { z } from 'zod';

function redirectToDashboard() {
  const { role, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated()) return;
  if (role === 'Candidate') {
    throw redirect({ to: '/dashboard' });
  }
  if (role === 'SuperAdmin') {
    throw redirect({ to: '/admin/companies' });
  }
  throw redirect({ to: '/company/dashboard' });
}

export const Route = createFileRoute('/auth/signin')({
  validateSearch: z.object({
    returnTo: z.string().optional(),
  }),
  beforeLoad: redirectToDashboard,
  component: SignInRoute,
});

function SignInRoute() {
  return <SignInPage returnTo={Route.useSearch().returnTo} />;
}
