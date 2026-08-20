import { createFileRoute } from '@tanstack/react-router';
import { InterviewListView } from '@/features/company/interviews/InterviewListView';

export const Route = createFileRoute('/company/interviews')({
  component: InterviewListView,
});
