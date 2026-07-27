import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';

export interface ApplyData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  coverLetter?: string;
  resumeUrl?: string;
}

export function useApply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, data }: { jobId: string; data: ApplyData }) =>
      candidateApi.applyToJob(jobId, data),
    onSuccess: () => {
      // Invalidate applications query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['candidate', 'applications'] });
    },
  });
}