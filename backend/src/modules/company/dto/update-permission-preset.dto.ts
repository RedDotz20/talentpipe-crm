import { z } from 'zod';

export const UpdatePermissionPresetSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(z.string()).min(0).max(17).optional(),
  })
  .refine((v) => v.name !== undefined || v.permissions !== undefined, {
    message: 'Provide at least one field to update',
  });

export type UpdatePermissionPresetDto = z.infer<
  typeof UpdatePermissionPresetSchema
>;
