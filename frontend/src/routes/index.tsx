import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/api/useAuth';
import { LandingPage } from '@/features/landing/LandingPage';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const { role, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated()) {
      return;
    }
    if (role === 'Candidate') {
      throw redirect({ to: '/dashboard' });
    }
    if (role === 'SuperAdmin') {
      throw redirect({ to: '/admin/dashboard' });
    }
    throw redirect({ to: '/company/dashboard' });
  },
  component: LandingPage,
});
