import { createFileRoute } from '@tanstack/react-router';
import { JobSearchPage } from '../../features/candidate-portal/dashboard/JobSearchPage';

export const Route = createFileRoute('/_candidate/dashboard')({
  component: JobSearchPage,
});
