import { z } from 'zod';

export const CompanySignupSchema = z.object({
  companyName: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export type CompanySignupDto = z.infer<typeof CompanySignupSchema>;
