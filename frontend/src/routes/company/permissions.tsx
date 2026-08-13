import { createFileRoute, redirect } from '@tanstack/react-router';
import { PermissionPresetsPage } from '../../features/company/permissions/PermissionPresetsPage';
import { useAuthStore } from '../../api/useAuth';

export const Route = createFileRoute('/company/permissions')({
  beforeLoad: () => {
    if (useAuthStore.getState().role !== 'CompanyAdmin') {
      throw redirect({ to: '/company/dashboard' });
    }
  },
  component: PermissionPresetsPage,
});
