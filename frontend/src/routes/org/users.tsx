import { createFileRoute, redirect } from '@tanstack/react-router';
import { UserManagementPage } from '../../features/org/users/UserManagementPage';
import { useAuthStore } from '../../api/useAuth';

export const Route = createFileRoute('/org/users')({
  beforeLoad: () => {
    if (useAuthStore.getState().role !== 'OrgAdmin') {
      throw redirect({ to: '/org/dashboard' });
    }
  },
  component: UserManagementPage,
});
