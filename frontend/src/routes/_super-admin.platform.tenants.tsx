import { createFileRoute } from '@tanstack/react-router';
import { TenantsPage } from '../features/admin/TenantsPage';

export const Route = createFileRoute('/_super-admin/platform/tenants')({
  component: TenantsPage,
});
