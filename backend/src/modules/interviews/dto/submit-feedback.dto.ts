import { z } from 'zod';

export const SubmitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comments: z.string().max(5000).optional(),
});

export type SubmitFeedbackDto = z.infer<typeof SubmitFeedbackSchema>;
