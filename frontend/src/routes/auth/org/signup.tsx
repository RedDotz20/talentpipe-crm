import { createFileRoute, redirect } from '@tanstack/react-router';
import { OrgSignupPage } from '@/features/auth/OrgSignupPage';
import { useAuthStore } from '@/api/useAuth';

export const Route = createFileRoute('/auth/org/signup')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      const { role } = useAuthStore.getState();
      if (role === 'Candidate') throw redirect({ to: '/dashboard' });
      if (role === 'SuperAdmin') throw redirect({ to: '/admin/tenants' });
      throw redirect({ to: '/org/dashboard' });
    }
  },
  component: OrgSignupPage,
});
