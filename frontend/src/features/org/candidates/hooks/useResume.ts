import { useQuery } from '@tanstack/react-query';
import { resumesApi } from '@/api/resumesApi';
import { queryKeys } from '@/api/queryKeys';

export function useResume(candidateId: string) {
  return useQuery({
    queryKey: queryKeys.org.resume(candidateId),
    queryFn: () => resumesApi.get(candidateId),
    enabled: !!candidateId,
    retry: false,
  });
}
