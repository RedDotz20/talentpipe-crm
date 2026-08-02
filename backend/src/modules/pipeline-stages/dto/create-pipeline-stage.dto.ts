import { z } from 'zod';

export const CreatePipelineStageSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreatePipelineStageDto = z.infer<typeof CreatePipelineStageSchema>;
