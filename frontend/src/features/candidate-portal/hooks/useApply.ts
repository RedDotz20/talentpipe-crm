import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';
import { queryKeys } from '../../../api/queryKeys';
import type { ApplyData } from '../types';

export function useApply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, data }: { jobId: string; data: ApplyData }) =>
      candidateApi.applyToJob(jobId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.applications() });
    },
  });
}
