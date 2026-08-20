import { z } from 'zod';
import {
  EMPLOYMENT_TYPES,
  WORK_SETUPS,
} from '@/modules/job-postings/dto/create-job-posting.dto';

export const UpdateJobPostingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  location: z.string().trim().min(1).max(150).optional(),
  workSetup: z.enum(WORK_SETUPS).optional(),
  requiredSkillIds: z.array(z.string().uuid()).max(50).optional(),
});

export type UpdateJobPostingDto = z.infer<typeof UpdateJobPostingSchema>;
