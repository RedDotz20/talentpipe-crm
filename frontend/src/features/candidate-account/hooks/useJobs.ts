import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/api/candidateApi';
import { queryKeys, type CandidateJobsParams } from '@/api/queryKeys';

export function useJobs(params?: CandidateJobsParams) {
  return useQuery({
    queryKey: queryKeys.candidate.jobs(params),
    queryFn: () => candidateApi.getJobs(params),
    enabled: typeof window !== 'undefined',
  });
}
