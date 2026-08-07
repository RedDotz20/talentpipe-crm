import { z } from 'zod';

export const UpdateCandidateSchema = z
  .object({
    email: z.string().email('Invalid email').max(255).optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(50).nullable().optional(),
  })
  .refine(
    (value) =>
      value.email !== undefined ||
      value.password !== undefined ||
      value.firstName !== undefined ||
      value.lastName !== undefined ||
      value.phone !== undefined,
    { message: 'At least one field is required' },
  );

export type UpdateCandidateDto = z.infer<typeof UpdateCandidateSchema>;
