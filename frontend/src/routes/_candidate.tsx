import { createFileRoute, redirect } from '@tanstack/react-router';
import { CandidatePlatform } from '../shared/components/CandidatePlatform';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/_candidate')({
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/auth/signin' });
    }
    const { role } = useAuthStore.getState();
    if (role === 'SuperAdmin') throw redirect({ to: '/admin/tenants' });
    if (role !== 'Candidate') throw redirect({ to: '/org/dashboard' });
  },
  component: CandidatePlatform,
});
