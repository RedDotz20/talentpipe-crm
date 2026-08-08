import { useQuery } from '@tanstack/react-query';
import { skillsApi } from '@/api/skillsApi';
import { queryKeys } from '@/api/queryKeys';

export function useSearchSkills(query: string) {
  return useQuery({
    queryKey: queryKeys.company.skills(query),
    queryFn: () => skillsApi.search(query || undefined),
    enabled: query.trim().length > 0,
  });
}
