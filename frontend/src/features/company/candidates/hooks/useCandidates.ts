import { useQuery } from '@tanstack/react-query';
import { candidatesApi } from '@/api/candidatesApi';
import { queryKeys } from '@/api/queryKeys';
import type { ListQueryParams } from '@/shared/types/listQuery';

export function useCandidates(params?: ListQueryParams) {
  return useQuery({
    queryKey: queryKeys.company.candidates(params),
    queryFn: () => candidatesApi.list(params),
  });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: queryKeys.company.candidate(id),
    queryFn: () => candidatesApi.get(id),
    enabled: !!id,
  });
}
