import { z } from 'zod';

export const ListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sortBy: z.string().trim().max(50).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type ListQueryDto = z.infer<typeof ListQuerySchema>;
