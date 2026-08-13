import { z } from 'zod';

export const BulkSetEnabledSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  enabled: z.boolean(),
});

export type BulkSetEnabledDto = z.infer<typeof BulkSetEnabledSchema>;
