import { z } from 'zod';
import {
  EMPLOYMENT_TYPES,
  WORK_SETUPS,
} from '../../job-postings/dto/create-job-posting.dto';

export const UpdatePlatformJobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(255, 'Title is too long')
      .optional(),
    description: z
      .string()
      .trim()
      .max(20000, 'Description is too long')
      .nullable()
      .optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    location: z.string().trim().min(1).max(150).optional(),
    workSetup: z.enum(WORK_SETUPS).optional(),
    requiredSkillIds: z.array(z.string().uuid('Invalid skill id')).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'No fields to update');

export type UpdatePlatformJobDto = z.infer<typeof UpdatePlatformJobSchema>;
