import { createFileRoute, redirect } from '@tanstack/react-router';
import { CandidateLoginPage } from '../features/candidate/login/LoginPage';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/_candidate/candidate/login')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/candidate/dashboard' });
    }
  },
  component: CandidateLoginPage,
});
