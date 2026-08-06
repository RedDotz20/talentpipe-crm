import { createFileRoute, redirect } from '@tanstack/react-router';
import { OrgSettingsPage } from '../../features/org/settings/OrgSettingsPage';
import { useAuthStore } from '../../api/useAuth';

export const Route = createFileRoute('/org/settings')({
  beforeLoad: () => {
    if (useAuthStore.getState().role !== 'OrgAdmin') {
      throw redirect({ to: '/org/dashboard' });
    }
  },
  component: OrgSettingsPage,
});
