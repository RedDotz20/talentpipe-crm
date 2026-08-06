import { useQuery, useQueryClient } from '@tanstack/react-query';
import { interviewsApi, type Interview } from '@/api/interviewsApi';
import { orgUsersApi } from '@/api/orgUsersApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useInterviews() {
  return useQuery({
    queryKey: queryKeys.org.interviews(),
    queryFn: () => interviewsApi.list(),
  });
}

export function useInterview(id: string) {
  return useQuery({
    queryKey: queryKeys.org.interview(id),
    queryFn: () => interviewsApi.get(id),
    enabled: !!id,
  });
}

export function useOrgUsers() {
  return useQuery({
    queryKey: queryKeys.org.orgUsers(),
    queryFn: () => orgUsersApi.list(),
  });
}

export function useScheduleInterview() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: interviewsApi.create,
    successMessage: 'Interview scheduled',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.interviews() });
      queryClient.invalidateQueries({ queryKey: queryKeys.org.applications() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.org.interviews() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.org.interviews() });
    },
  });
}

export type { Interview };
