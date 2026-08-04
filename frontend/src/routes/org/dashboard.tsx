import { createFileRoute } from '@tanstack/react-router';
import { OrgDashboardPage } from '../../features/org/dashboard/OrgDashboardPage';

export const Route = createFileRoute('/org/dashboard')({
  component: OrgDashboardPage,
});
