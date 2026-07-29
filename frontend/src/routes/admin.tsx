import { createFileRoute, redirect } from '@tanstack/react-router';
import { SuperAdminPlatform } from '@/features/admin/layout';
import { useAuthStore } from '@/api/useAuth';

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/auth/signin' });
    }
    const { role } = useAuthStore.getState();
    if (role !== 'SuperAdmin') {
      if (role === 'Candidate') throw redirect({ to: '/dashboard' });
      throw redirect({ to: '/org/dashboard' });
    }
  },
  component: SuperAdminPlatform,
});
