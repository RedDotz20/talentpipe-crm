import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resumesApi } from '@/api/resumesApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useResume(candidateId: string) {
  return useQuery({
    queryKey: queryKeys.org.resume(candidateId),
    queryFn: () => resumesApi.get(candidateId),
    enabled: !!candidateId,
    retry: false,
  });
}

export function useUploadResume(candidateId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (file: File) => resumesApi.upload(candidateId, file),
    successMessage: 'Resume uploaded and analyzed',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.resume(candidateId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.org.candidate(candidateId),
      });
    },
  });
}
