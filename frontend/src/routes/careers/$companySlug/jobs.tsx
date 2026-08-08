import { createFileRoute } from '@tanstack/react-router';
import { JobListingPage } from '@/features/public-careers/JobListingPage';

export const Route = createFileRoute('/careers/$companySlug/jobs')({
  component: CareersJobsRoute,
});

function CareersJobsRoute() {
  const { companySlug } = Route.useParams();
  return <JobListingPage companySlug={companySlug} />;
}
