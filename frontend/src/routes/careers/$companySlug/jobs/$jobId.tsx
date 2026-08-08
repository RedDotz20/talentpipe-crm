import { createFileRoute } from '@tanstack/react-router';
import { JobDetailPage } from '@/features/public-careers/JobDetailPage';

export const Route = createFileRoute('/careers/$companySlug/jobs/$jobId')({
  component: CareersJobDetailRoute,
});

function CareersJobDetailRoute() {
  const { companySlug, jobId } = Route.useParams();
  return <JobDetailPage companySlug={companySlug} jobId={jobId} />;
}
