import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jobPostingsApi } from '@/api/jobPostingsApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { UpdateJobPostingInput } from '@/api/jobPostingsApi';

export function useJobPostings(status?: string) {
  return useQuery({
    queryKey: queryKeys.company.jobPostings(status),
    queryFn: () => jobPostingsApi.list(status),
  });
}

export function useJobPosting(id: string) {
  return useQuery({
    queryKey: queryKeys.company.jobPosting(id),
    queryFn: () => jobPostingsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateJobPosting() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: jobPostingsApi.create,
    successMessage: 'Job posting created',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.jobPostings() });
    },
  });
}

export function useUpdateJobPosting() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateJobPostingInput }) =>
      jobPostingsApi.update(id, input),
    successMessage: 'Job posting updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.jobPostings() });
    },
  });
}

export function usePublishJobPosting() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: jobPostingsApi.publish,
    successMessage: 'Job posting published',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.jobPostings() });
    },
  });
}

export function useCloseJobPosting() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: jobPostingsApi.close,
    successMessage: 'Job posting closed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.jobPostings() });
    },
  });
}

export function useDeleteJobPosting() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: jobPostingsApi.remove,
    successMessage: 'Job posting deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.jobPostings() });
    },
  });
}
