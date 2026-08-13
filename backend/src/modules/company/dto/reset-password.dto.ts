import { z } from 'zod';

export const ResetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
