import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';

export function useApplications() {
  return useQuery({
    queryKey: queryKeys.candidate.applications(),
    queryFn: () => candidateApi.getApplications(),
    enabled: typeof window !== 'undefined',
  });
}
