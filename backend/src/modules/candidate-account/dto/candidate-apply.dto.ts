import { z } from 'zod';

export const BookmarkJobSchema = z.object({
  tenantId: z.string().uuid(),
  jobPostingId: z.string().uuid(),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional(),
});

export type BookmarkJobDto = z.infer<typeof BookmarkJobSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
