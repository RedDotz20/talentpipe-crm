import { z } from 'zod';

export const ApplyJobSchema = z.object({
  phone: z.string().max(50).optional(),
});

export type ApplyJobDto = z.infer<typeof ApplyJobSchema>;
