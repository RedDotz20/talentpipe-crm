import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const { role, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated()) {
      throw redirect({ to: '/login' });
    }
    if (role === 'Candidate') {
      throw redirect({ to: '/candidate/dashboard' });
    }
    if (role === 'SuperAdmin') {
      throw redirect({ to: '/platform/tenants' });
    }
    throw redirect({ to: '/dashboard' });
  },
});
