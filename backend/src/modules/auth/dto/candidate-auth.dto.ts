import { z } from 'zod';

export const CandidateSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(50).optional(),
});

export type CandidateSignupDto = z.infer<typeof CandidateSignupSchema>;
