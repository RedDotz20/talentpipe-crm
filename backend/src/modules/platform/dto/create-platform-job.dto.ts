import { z } from 'zod';
import {
  EMPLOYMENT_TYPES,
  WORK_SETUPS,
} from '../../job-postings/dto/create-job-posting.dto';

export const CreatePlatformJobSchema = z.object({
  companyId: z.string().uuid('Invalid company id'),
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(255, 'Title is too long'),
  description: z
    .string()
    .trim()
    .max(20000, 'Description is too long')
    .optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  location: z.string().trim().min(1, 'Location is required').max(150),
  workSetup: z.enum(WORK_SETUPS),
  requiredSkillIds: z.array(z.string().uuid('Invalid skill id')).optional(),
});

export type CreatePlatformJobDto = z.infer<typeof CreatePlatformJobSchema>;
