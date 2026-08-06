import { z } from 'zod';

export const UpdateInterviewSchema = z
  .object({
    scheduledAt: z.string().datetime().optional(),
    status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  })
  .refine(
    (value) => value.scheduledAt !== undefined || value.status !== undefined,
    {
      message: 'At least one of scheduledAt or status is required',
    },
  );

export type UpdateInterviewDto = z.infer<typeof UpdateInterviewSchema>;
