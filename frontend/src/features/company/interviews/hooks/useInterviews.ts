import { useQuery, useQueryClient } from '@tanstack/react-query';
import { interviewsApi, type Interview } from '@/api/interviewsApi';
import { companyUsersApi } from '@/api/companyUsersApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useInterviews() {
  return useQuery({
    queryKey: queryKeys.company.interviews(),
    queryFn: () => interviewsApi.list(),
  });
}

export function useInterview(id: string) {
  return useQuery({
    queryKey: queryKeys.company.interview(id),
    queryFn: () => interviewsApi.get(id),
    enabled: !!id,
  });
}

export function useCompanyUsers() {
  return useQuery({
    queryKey: queryKeys.company.companyUsers(),
    queryFn: () => companyUsersApi.list(),
  });
}

export function useScheduleInterview() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: interviewsApi.create,
    successMessage: 'Interview scheduled',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.interviews() });
      queryClient.invalidateQueries({ queryKey: queryKeys.company.applications() });
    },
  });
}

export function useUpdateInterview() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { scheduledAt?: string; status?: 'scheduled' | 'completed' | 'cancelled' };
    }) => interviewsApi.update(id, input),
    successMessage: 'Interview updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.interviews() });
    },
  });
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({
      id,
      rating,
      comments,
    }: {
      id: string;
      rating: number;
      comments?: string;
    }) => interviewsApi.submitFeedback(id, { rating, comments }),
    successMessage: 'Feedback submitted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.interviews() });
    },
  });
}

export type { Interview };
