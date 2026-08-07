import { createFileRoute } from '@tanstack/react-router';
import { CandidatesPage } from '@/features/admin/CandidatesPage';

export const Route = createFileRoute('/admin/candidates')({
  component: CandidatesPage,
});
