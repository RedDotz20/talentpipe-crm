import { createFileRoute, redirect } from '@tanstack/react-router';
import { CandidatePlatform } from '@/features/candidate-account/layout';
import { useAuthStore } from '@/api/useAuth';

export const Route = createFileRoute('/_candidate')({
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/auth/signin' });
    }
    const { role } = useAuthStore.getState();
    if (role === 'SuperAdmin') throw redirect({ to: '/admin/dashboard' });
    if (role !== 'Candidate') throw redirect({ to: '/company/dashboard' });
  },
  component: CandidatePlatform,
});
