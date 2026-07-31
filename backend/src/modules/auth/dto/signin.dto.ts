import { z } from 'zod';

export const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SigninDto = z.infer<typeof SigninSchema>;
