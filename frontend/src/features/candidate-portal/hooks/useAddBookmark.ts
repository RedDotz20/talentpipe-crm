import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';

export function useAddBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tenantId, jobPostingId }: { tenantId: string; jobPostingId: string }) =>
      candidateApi.addBookmark(tenantId, jobPostingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.bookmarks() });
    },
  });
}
