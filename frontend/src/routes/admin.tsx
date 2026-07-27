import { createFileRoute } from '@tanstack/react-router';
import { SuperAdminPlatform } from '../app/SuperAdminPlatform';

export const Route = createFileRoute('/admin')({
  component: SuperAdminPlatform,
});
