import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { Skill } from '../types';

export function useCandidateSkills() {
  return useQuery({
    queryKey: queryKeys.candidate.skills(),
    queryFn: candidateApi.getSkills,
    select: (data) => data.skills,
  });
}

export function useSetCandidateSkills() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (skillIds: string[]) => candidateApi.setSkills(skillIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.skills() });
    },
  });
}

export function useAllSkills() {
  return useQuery<Skill[]>({
    queryKey: ['skills', 'all'],
    queryFn: async () => {
      const { skillsApi } = await import('@/api/skillsApi');
      const result = await skillsApi.search();
      return result;
    },
  });
}