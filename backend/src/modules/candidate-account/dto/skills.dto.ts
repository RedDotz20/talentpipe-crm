import { z } from 'zod';

export const SetCandidateSkillsSchema = z.object({
  skillIds: z.array(z.string().uuid()),
});

export type SetCandidateSkillsDto = z.infer<typeof SetCandidateSkillsSchema>;
