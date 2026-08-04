import { useQuery } from '@tanstack/react-query';
import { candidatesApi } from '@/api/candidatesApi';
import { queryKeys } from '@/api/queryKeys';

export function useCandidates() {
  return useQuery({
    queryKey: queryKeys.org.candidates(),
    queryFn: () => candidatesApi.list(),
  });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: queryKeys.org.candidate(id),
    queryFn: () => candidatesApi.get(id),
    enabled: !!id,
  });
}
