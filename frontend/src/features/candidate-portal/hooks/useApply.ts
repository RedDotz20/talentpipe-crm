import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { ApplyData } from '@/features/candidate-portal/types';

export function useApply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tenantId, jobId, data }: { tenantId: string; jobId: string; data: ApplyData }) =>
      candidateApi.applyToJob(tenantId, jobId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.applications() });
    },
  });
}
