import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '../../api/candidateApi';
import { queryKeys } from '../../api/queryKeys';

export function useJobDetail(tenantId: string, jobId: string) {
  return useQuery({
    queryKey: queryKeys.candidate.jobDetail(tenantId, jobId),
    queryFn: () => candidateApi.getJobDetail(tenantId, jobId),
    enabled: typeof window !== 'undefined' && !!tenantId && !!jobId,
  });
}