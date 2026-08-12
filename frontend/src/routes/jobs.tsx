import { createFileRoute } from '@tanstack/react-router';
import { JobListingPage } from '@/features/public-careers/JobListingPage';

export const Route = createFileRoute('/jobs')({
  component: () => <JobListingPage />,
});
