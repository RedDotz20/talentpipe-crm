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
