import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/api/authApi';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore, type AuthProfile } from '@/api/useAuth';
import type { ApiEnvelope } from './useApiMutation';

export function useMe() {
  const setProfile = useAuthStore((s) => s.setProfile);
  return useQuery({
    queryKey: queryKeys.auth.me(),
    enabled: Boolean(useAuthStore.getState().accessToken),
    queryFn: async () => {
      const { data } = await authApi.me();
      const profile = (data as ApiEnvelope<AuthProfile>).data;
      setProfile(profile);
      return profile;
    },
  });
}
