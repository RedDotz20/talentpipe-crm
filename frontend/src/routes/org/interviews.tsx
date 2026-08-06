import { createFileRoute } from '@tanstack/react-router';
import { InterviewListView } from '../../features/org/interviews/InterviewListView';

export const Route = createFileRoute('/org/interviews')({
  component: InterviewListView,
});
