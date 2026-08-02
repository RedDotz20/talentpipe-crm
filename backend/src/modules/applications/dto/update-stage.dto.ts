import { z } from 'zod';

export const UpdateStageSchema = z.object({
  stageId: z.string().uuid(),
});

export type UpdateStageDto = z.infer<typeof UpdateStageSchema>;
