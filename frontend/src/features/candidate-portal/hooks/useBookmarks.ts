import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import type { ListQueryParams } from '@/shared/types/listQuery';

export function useBookmarks(params?: ListQueryParams) {
  return useQuery({
    queryKey: queryKeys.candidate.bookmarks(params),
    queryFn: () => candidateApi.getBookmarks(params),
    enabled: typeof window !== 'undefined',
  });
}
