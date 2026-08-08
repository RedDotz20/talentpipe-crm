import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';

export function useJobDetail(companyId: string, jobId: string) {
  return useQuery({
    queryKey: queryKeys.candidate.jobDetail(companyId, jobId),
    queryFn: () => candidateApi.getJobDetail(companyId, jobId),
    enabled: typeof window !== 'undefined' && !!companyId && !!jobId,
  });
}
