import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '../../features/candidate-portal/settings/SettingsPage';

export const Route = createFileRoute('/_candidate/settings')({
  component: SettingsPage,
});
