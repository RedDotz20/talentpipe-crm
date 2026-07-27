import { createFileRoute } from '@tanstack/react-router';
import { JobSearchPage } from '../features/candidate/dashboard/JobSearchPage';

export const Route = createFileRoute('/_candidate/candidate/dashboard')({
  component: JobSearchPage,
});
