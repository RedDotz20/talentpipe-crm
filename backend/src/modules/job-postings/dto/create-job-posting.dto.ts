import { z } from 'zod';

export const CreateJobPostingSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  requiredSkillIds: z.array(z.string().uuid()).max(50).optional(),
});

export type CreateJobPostingDto = z.infer<typeof CreateJobPostingSchema>;
