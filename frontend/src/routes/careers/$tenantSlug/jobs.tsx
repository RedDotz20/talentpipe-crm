import { createFileRoute } from '@tanstack/react-router';
import { JobListingPage } from '@/features/public-careers/JobListingPage';

export const Route = createFileRoute('/careers/$tenantSlug/jobs')({
  component: CareersJobsRoute,
});

function CareersJobsRoute() {
  const { tenantSlug } = Route.useParams();
  return <JobListingPage tenantSlug={tenantSlug} />;
}
