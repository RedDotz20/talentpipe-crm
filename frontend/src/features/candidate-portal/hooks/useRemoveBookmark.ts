import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { Bookmark } from '@/features/candidate-portal/types';

export function useRemoveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookmarkId: string) => candidateApi.removeBookmark(bookmarkId),
    onMutate: async (bookmarkId: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.candidate.bookmarks() });

      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(
        queryKeys.candidate.bookmarks()
      );

      queryClient.setQueryData<Bookmark[]>(
        queryKeys.candidate.bookmarks(),
        (old) => old?.filter((b) => b.id !== bookmarkId) ?? []
      );

      return { previousBookmarks };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousBookmarks) {
        queryClient.setQueryData(queryKeys.candidate.bookmarks(), context.previousBookmarks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate.bookmarks() });
    },
  });
}
