import { z } from 'zod';

export const CreateCandidateSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(50).optional().or(z.literal('')),
});

export type CreateCandidateDto = z.infer<typeof CreateCandidateSchema>;
