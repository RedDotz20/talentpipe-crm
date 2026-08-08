import { createFileRoute, redirect } from '@tanstack/react-router';
import { UserManagementPage } from '../../features/company/users/UserManagementPage';
import { useAuthStore } from '../../api/useAuth';

export const Route = createFileRoute('/company/users')({
  beforeLoad: () => {
    if (useAuthStore.getState().role !== 'CompanyAdmin') {
      throw redirect({ to: '/company/dashboard' });
    }
  },
  component: UserManagementPage,
});
