import { useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '@/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useWithdrawApplication() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (applicationId: string) =>
      candidateApi.withdrawApplication(applicationId).then(() => ({
        data: undefined,
        message: 'Application withdrawn',
      })),
    successMessage: 'Application withdrawn',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.applications() });
    },
  });
}
