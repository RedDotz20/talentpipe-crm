import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.candidate.profile(),
    queryFn: () => candidateApi.getProfile(),
    enabled: typeof window !== 'undefined',
  });
}
