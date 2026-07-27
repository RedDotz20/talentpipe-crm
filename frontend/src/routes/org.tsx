import { createFileRoute } from '@tanstack/react-router';
import { OrgPlatform } from '../app/OrgPlatform';

export const Route = createFileRoute('/org')({
  component: OrgPlatform,
});
