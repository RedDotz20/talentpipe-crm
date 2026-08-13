import { createFileRoute } from '@tanstack/react-router';
import { PermissionsPage } from '@/features/admin/PermissionsPage';

export const Route = createFileRoute('/admin/permissions')({
  component: PermissionsPage,
});
