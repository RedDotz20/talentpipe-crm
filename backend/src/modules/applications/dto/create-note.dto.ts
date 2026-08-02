import { z } from 'zod';

export const CreateNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;
