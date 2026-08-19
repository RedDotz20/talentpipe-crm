import { createFileRoute, redirect } from '@tanstack/react-router';
import { CandidateSignupPage } from '@/features/candidate-account/signup/SignupPage';
import { useAuthStore } from '@/api/useAuth';
import { z } from 'zod';

export const Route = createFileRoute('/auth/signup')({
  validateSearch: z.object({
    returnTo: z.string().optional(),
  }),
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated()) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: CandidateSignupRoute,
});

function CandidateSignupRoute() {
  return <CandidateSignupPage returnTo={Route.useSearch().returnTo} />;
}
