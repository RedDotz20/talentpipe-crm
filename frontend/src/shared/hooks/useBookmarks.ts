import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';

export interface Bookmark {
  id: string;
  jobListingId: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
}

export function useBookmarks() {
  return useQuery({
    queryKey: ['candidate', 'bookmarks'],
    queryFn: () => candidateApi.getBookmarks(),
    enabled: typeof window !== 'undefined',
  });
}