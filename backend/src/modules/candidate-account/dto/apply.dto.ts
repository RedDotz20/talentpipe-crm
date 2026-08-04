import { z } from 'zod';

export const ApplyJobSchema = z.object({
  phone: z.string().max(50).optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  coverLetter: z.string().max(5000).optional(),
});

export type ApplyJobDto = z.infer<typeof ApplyJobSchema>;
