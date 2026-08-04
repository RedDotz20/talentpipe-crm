import { createFileRoute } from '@tanstack/react-router';
import { JobDetailPage } from '@/features/public-careers/JobDetailPage';

export const Route = createFileRoute('/careers/$tenantSlug/jobs/$jobId')({
  component: CareersJobDetailRoute,
});

function CareersJobDetailRoute() {
  const { tenantSlug, jobId } = Route.useParams();
  return <JobDetailPage tenantSlug={tenantSlug} jobId={jobId} />;
}
