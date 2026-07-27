import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { useAuthStore } from '../shared/api/useAuth';

function redirectToDashboard() {
  const { role, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated()) return;
  if (role === 'Candidate') {
    throw redirect({ to: '/candidate/dashboard' });
  }
  if (role === 'SuperAdmin') {
    throw redirect({ to: '/platform/tenants' });
  }
  throw redirect({ to: '/dashboard' });
}

export const Route = createFileRoute('/login')({
  beforeLoad: redirectToDashboard,
  component: LoginPage,
});
