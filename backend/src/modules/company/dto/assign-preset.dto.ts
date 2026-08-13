import { z } from 'zod';

export const AssignPresetSchema = z.object({
  presetId: z.string().uuid().nullable(),
});

export type AssignPresetDto = z.infer<typeof AssignPresetSchema>;
