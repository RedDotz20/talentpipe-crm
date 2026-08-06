import { createFileRoute } from '@tanstack/react-router';
import { TenantDetailPage } from '@/features/admin/TenantDetailPage';

export const Route = createFileRoute('/admin/tenants/$tenantId')({
  component: TenantDetailRoute,
});

function TenantDetailRoute() {
  const { tenantId } = Route.useParams();
  return <TenantDetailPage tenantId={tenantId} />;
}
