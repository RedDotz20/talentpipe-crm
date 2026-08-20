import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { ListQueryParams } from '@/shared/types/listQuery';

export function useApplications(params?: ListQueryParams & { status?: string }) {
  return useQuery({
    queryKey: queryKeys.candidate.applications(params),
    queryFn: () => candidateApi.getApplications(params),
    enabled: typeof window !== 'undefined',
  });
}
