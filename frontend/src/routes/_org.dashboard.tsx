import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_org/dashboard')({
  component: () => <div>Dashboard</div>,
});
