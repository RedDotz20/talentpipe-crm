import { useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';

export function useRemoveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobListingId: string) => candidateApi.removeBookmark(jobListingId),
    onSuccess: (_, jobListingId) => {
      // Optimistically update the bookmarks cache
      queryClient.setQueryData<Bookmark[]>(['candidate', 'bookmarks'], (old) =>
        old ? old.filter((b) => b.jobListingId !== jobListingId) : []
      );
    },
    onError: () => {
      // Refetch on error to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['candidate', 'bookmarks'] });
    },
  });
}

interface Bookmark {
  id: string;
  jobListingId: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
}