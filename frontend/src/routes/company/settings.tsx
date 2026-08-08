import { createFileRoute, redirect } from '@tanstack/react-router';
import { CompanySettingsPage } from '../../features/company/settings/CompanySettingsPage';
import { useAuthStore } from '../../api/useAuth';

export const Route = createFileRoute('/company/settings')({
  beforeLoad: () => {
    if (useAuthStore.getState().role !== 'CompanyAdmin') {
      throw redirect({ to: '/company/dashboard' });
    }
  },
  component: CompanySettingsPage,
});
