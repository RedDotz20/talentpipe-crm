import { createFileRoute, redirect } from '@tanstack/react-router';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/_candidate/candidate/signup')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/candidate/dashboard' });
    }
  },
  component: CandidateSignupPage,
});
