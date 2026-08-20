import { z } from 'zod';
import { INTERNAL_ROLES } from '@/common/permissions/permissions';

export const CreatePlatformPresetSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(INTERNAL_ROLES),
  permissions: z.array(z.string()).min(0).max(17),
});

export type CreatePlatformPresetDto = z.infer<
  typeof CreatePlatformPresetSchema
>;
