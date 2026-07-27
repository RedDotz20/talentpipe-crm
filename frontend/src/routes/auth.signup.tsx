import { createFileRoute, redirect } from '@tanstack/react-router';
import { CandidateSignupPage } from '../features/candidate/signup/SignupPage';
import { useAuthStore } from '../shared/api/useAuth';

export const Route = createFileRoute('/auth/signup')({
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: CandidateSignupPage,
});
