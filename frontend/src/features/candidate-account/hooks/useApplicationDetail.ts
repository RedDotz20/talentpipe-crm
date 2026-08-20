import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';

export function useApplicationDetail(applicationId: string | null) {
  return useQuery({
    queryKey: queryKeys.candidate.application(applicationId ?? ''),
    queryFn: () => candidateApi.getApplication(applicationId ?? ''),
    enabled: typeof window !== 'undefined' && !!applicationId,
  });
}
