import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '@/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { ApplyData } from '@/features/candidate-account/types';

export function useApply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, jobId, data }: { companyId: string; jobId: string; data: ApplyData }) =>
      candidateApi.applyToJob(companyId, jobId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.applications() });
    },
  });
}
