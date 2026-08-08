import { createFileRoute, redirect } from '@tanstack/react-router';
import { CompanySignupPage } from '@/features/auth/CompanySignupPage';
import { useAuthStore } from '@/api/useAuth';

export const Route = createFileRoute('/auth/company/signup')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      const { role } = useAuthStore.getState();
      if (role === 'Candidate') throw redirect({ to: '/dashboard' });
      if (role === 'SuperAdmin') throw redirect({ to: '/admin/companies' });
      throw redirect({ to: '/company/dashboard' });
    }
  },
  component: CompanySignupPage,
});
