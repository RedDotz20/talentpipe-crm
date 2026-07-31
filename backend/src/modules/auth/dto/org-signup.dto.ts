import { z } from 'zod';

export const OrgSignupSchema = z.object({
  companyName: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export type OrgSignupDto = z.infer<typeof OrgSignupSchema>;
