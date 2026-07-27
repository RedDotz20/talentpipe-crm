import { createFileRoute } from '@tanstack/react-router';
import { ApplicationsPage } from '../features/candidate/applications/ApplicationsPage';

export const Route = createFileRoute('/_candidate/applications')({
  component: ApplicationsPage,
});
