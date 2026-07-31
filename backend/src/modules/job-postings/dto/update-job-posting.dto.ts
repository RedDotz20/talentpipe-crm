import { z } from 'zod';

export const UpdateJobPostingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).nullable().optional(),
  requiredSkillIds: z.array(z.string().uuid()).max(50).optional(),
});

export type UpdateJobPostingDto = z.infer<typeof UpdateJobPostingSchema>;
