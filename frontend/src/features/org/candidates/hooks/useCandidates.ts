import { useQuery, useQueryClient } from '@tanstack/react-query';
import { candidatesApi } from '@/api/candidatesApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

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

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: candidatesApi.create,
    successMessage: 'Candidate added',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.candidates() });
    },
  });
}
