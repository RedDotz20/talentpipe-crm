import { z } from 'zod';

export const UpdateCompanyProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(100).optional(),
});
export type UpdateCompanyProfileDto = z.infer<
  typeof UpdateCompanyProfileSchema
>;
