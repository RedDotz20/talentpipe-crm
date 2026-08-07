import { z } from 'zod';

export const MoveApplicationStageSchema = z.object({
  stageId: z.string().uuid('Invalid stage id'),
});

export type MoveApplicationStageDto = z.infer<
  typeof MoveApplicationStageSchema
>;
