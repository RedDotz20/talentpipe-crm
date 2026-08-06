import { z } from 'zod';
import { INTERNAL_USER_ROLES } from './invite-user.dto';

export const UpdateRoleSchema = z.object({
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
});

export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
