import { z } from 'zod';

export const CreateCandidateSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional(),
});

export type CreateCandidateDto = z.infer<typeof CreateCandidateSchema>;
