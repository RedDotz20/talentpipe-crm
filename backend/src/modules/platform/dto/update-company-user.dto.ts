import { z } from 'zod';
import { INTERNAL_USER_ROLES } from '@/modules/company/dto/invite-user.dto';

export const UpdateCompanyUserSchema = z
  .object({
    role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }).optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .optional(),
  })
  .refine((value) => value.role !== undefined || value.password !== undefined, {
    message: 'At least one of role or password is required',
  });

export type UpdateCompanyUserDto = z.infer<typeof UpdateCompanyUserSchema>;
