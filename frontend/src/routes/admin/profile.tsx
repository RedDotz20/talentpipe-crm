import { createFileRoute } from '@tanstack/react-router';
import { AdminProfilePage } from '@/features/admin/profile/ProfilePage';

export const Route = createFileRoute('/admin/profile')({
  component: AdminProfilePage,
});
