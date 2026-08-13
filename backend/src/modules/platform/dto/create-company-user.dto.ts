import { z } from 'zod';
import { INTERNAL_USER_ROLES } from '../../company/dto/invite-user.dto';

export const CreateCompanyUserSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  presetId: z.string().uuid().nullable().optional(),
});

export type CreateCompanyUserDto = z.infer<typeof CreateCompanyUserSchema>;
