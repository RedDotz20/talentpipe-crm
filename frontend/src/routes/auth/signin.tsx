import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignInPage } from '../../features/auth/SignInPage';
import { useAuthStore } from '../../api/useAuth';

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
