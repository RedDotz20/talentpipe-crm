import { createFileRoute } from '@tanstack/react-router';
import { SuperAdminPlatform } from '../app/SuperAdminPlatform';

export const Route = createFileRoute('/_super-admin')({
  component: SuperAdminPlatform,
});
