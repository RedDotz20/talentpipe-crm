import { z } from 'zod';
import { INTERNAL_USER_ROLES } from '../../org/dto/invite-user.dto';

export const CreateTenantUserSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

export type CreateTenantUserDto = z.infer<typeof CreateTenantUserSchema>;
