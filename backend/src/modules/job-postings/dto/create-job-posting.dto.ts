import { z } from 'zod';

export const EMPLOYMENT_TYPES = [
  'full-time',
  'part-time',
  'contract',
  'intern',
] as const;

export const WORK_SETUPS = ['on-site', 'hybrid', 'work-from-home'] as const;

export const CreateJobPostingSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  location: z.string().trim().min(1, 'Location is required').max(150),
  workSetup: z.enum(WORK_SETUPS),
  requiredSkillIds: z.array(z.string().uuid()).max(50).optional(),
});

export type CreateJobPostingDto = z.infer<typeof CreateJobPostingSchema>;
