import { createFileRoute } from '@tanstack/react-router';
import { JobsPage } from '@/features/admin/JobsPage';

export const Route = createFileRoute('/admin/jobs')({
  component: JobsPage,
});
