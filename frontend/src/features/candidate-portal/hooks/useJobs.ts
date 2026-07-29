import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';
import { queryKeys } from '../../../api/queryKeys';

export function useJobs(search?: string) {
  return useQuery({
    queryKey: queryKeys.candidate.jobs(search),
    queryFn: () => candidateApi.getJobs(search),
    enabled: typeof window !== 'undefined',
  });
}
