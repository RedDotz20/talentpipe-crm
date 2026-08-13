import { z } from 'zod';

export const BookmarkJobSchema = z.object({
  companyId: z.string().uuid(),
  jobPostingId: z.string().uuid(),
});

export type BookmarkJobDto = z.infer<typeof BookmarkJobSchema>;
