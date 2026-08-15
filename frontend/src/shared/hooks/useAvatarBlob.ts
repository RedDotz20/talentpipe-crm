import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

// Fetches one avatar object as a blob URL, cached by its S3 key. Object URLs
// are intentionally never revoked while the page lives (browser GC handles
// them); avatars are small and bounded by the 5MB upload cap.
export function useAvatarBlob(avatarUrl?: string | null): string | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.avatar(avatarUrl ?? ''),
    enabled: Boolean(avatarUrl),
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/avatars/file?key=${encodeURIComponent(avatarUrl as string)}`,
        { responseType: 'blob' },
      );
      return URL.createObjectURL(data as Blob);
    },
  });
  return data;
}
