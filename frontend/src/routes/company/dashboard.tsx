import { createFileRoute } from '@tanstack/react-router';
import { CompanyDashboardPage } from '@/features/company/dashboard/CompanyDashboardPage';

export const Route = createFileRoute('/company/dashboard')({
  component: CompanyDashboardPage,
});
