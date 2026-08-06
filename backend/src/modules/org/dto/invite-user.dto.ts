import { z } from 'zod';

export const INTERNAL_USER_ROLES = [
  'OrgAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
] as const;

export const InviteUserSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

export type InviteUserDto = z.infer<typeof InviteUserSchema>;
