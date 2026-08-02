import { z } from 'zod';

export const UpdatePipelineStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  order: z.number().int().min(0).optional(),
});

export type UpdatePipelineStageDto = z.infer<typeof UpdatePipelineStageSchema>;
