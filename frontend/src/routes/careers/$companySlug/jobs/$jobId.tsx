import { createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/api/useAuth';
import { JobDetailPage } from '@/features/public-careers/JobDetailPage';
import { getSafeCareerReturnTo } from '@/features/auth/returnTo';

export const Route = createFileRoute('/careers/$companySlug/jobs/$jobId')({
  beforeLoad: ({ params }) => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated()) {
      const returnTo = getSafeCareerReturnTo(
        `/careers/${params.companySlug}/jobs/${params.jobId}`,
      );
      throw redirect({
        to: '/auth/signin',
        search: returnTo ? { returnTo } : {},
      });
    }
  },
  component: CareersJobDetailRoute,
});

function CareersJobDetailRoute() {
  const { companySlug, jobId } = Route.useParams();
  return <JobDetailPage companySlug={companySlug} jobId={jobId} />;
}
