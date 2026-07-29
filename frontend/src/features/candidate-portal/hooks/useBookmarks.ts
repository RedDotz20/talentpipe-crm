import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';

export function useBookmarks() {
  return useQuery({
    queryKey: queryKeys.candidate.bookmarks(),
    queryFn: () => candidateApi.getBookmarks(),
    enabled: typeof window !== 'undefined',
  });
}
