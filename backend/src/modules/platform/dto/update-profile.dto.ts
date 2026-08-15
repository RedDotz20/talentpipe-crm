import { z } from 'zod';

export const UpdatePlatformProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
});
export type UpdatePlatformProfileDto = z.infer<
  typeof UpdatePlatformProfileSchema
>;
