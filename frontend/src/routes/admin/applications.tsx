import { createFileRoute } from '@tanstack/react-router';
import { ApplicationsPage } from '@/features/admin/ApplicationsPage';

export const Route = createFileRoute('/admin/applications')({
  component: ApplicationsPage,
});
