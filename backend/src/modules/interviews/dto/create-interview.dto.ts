import { z } from 'zod';

export const CreateInterviewSchema = z.object({
  applicationId: z.string().uuid(),
  interviewerId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});

export type CreateInterviewDto = z.infer<typeof CreateInterviewSchema>;
