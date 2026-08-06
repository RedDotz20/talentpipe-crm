import { z } from 'zod';

export const UpdateOrgSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255),
});

export type UpdateOrgDto = z.infer<typeof UpdateOrgSchema>;
