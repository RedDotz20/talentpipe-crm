import { createFileRoute } from '@tanstack/react-router';
import { CompanyDetailPage } from '@/features/admin/CompanyDetailPage';

export const Route = createFileRoute('/admin/companies/$companyId')({
  component: CompanyDetailRoute,
});

function CompanyDetailRoute() {
  const { companyId } = Route.useParams();
  return <CompanyDetailPage companyId={companyId} />;
}
