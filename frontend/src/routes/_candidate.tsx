import { createFileRoute } from '@tanstack/react-router';
import { CandidatePlatform } from '../shared/components/CandidatePlatform';

export const Route = createFileRoute('/_candidate')({
  component: CandidatePlatform,
});
