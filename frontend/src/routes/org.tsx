import { createFileRoute, redirect } from '@tanstack/react-router';
import { OrgPlatform } from '../features/org/layout';
import { useAuthStore } from '../api/useAuth';

export const Route = createFileRoute('/org')({
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/auth/signin' });
    }
    const { role } = useAuthStore.getState();
    if (role === 'Candidate') throw redirect({ to: '/dashboard' });
    if (role === 'SuperAdmin') throw redirect({ to: '/admin/tenants' });
  },
  component: OrgPlatform,
});
