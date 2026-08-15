import { createFileRoute } from '@tanstack/react-router';
import { CompanyProfilePage } from '@/features/company/profile/ProfilePage';

export const Route = createFileRoute('/company/profile')({
  component: CompanyProfilePage,
});
