import { z } from 'zod';

export const UpdateCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255),
});

export type UpdateCompanyDto = z.infer<typeof UpdateCompanySchema>;
