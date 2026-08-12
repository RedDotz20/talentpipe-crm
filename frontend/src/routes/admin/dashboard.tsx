import { createFileRoute } from '@tanstack/react-router';
import { PlatformDashboardPage } from '@/features/admin/PlatformDashboardPage';

export const Route = createFileRoute('/admin/dashboard')({
  component: PlatformDashboardPage,
});
