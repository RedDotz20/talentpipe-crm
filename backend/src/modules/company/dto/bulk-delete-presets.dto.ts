import { z } from 'zod';

export const BulkDeletePresetsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export type BulkDeletePresetsDto = z.infer<typeof BulkDeletePresetsSchema>;
