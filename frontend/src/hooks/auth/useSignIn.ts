import { useApiMutation, type ApiEnvelope } from '@/hooks/useApiMutation';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useSignIn() {
  const { setTokens } = useAuthStore();

  return useApiMutation<{ accessToken: string; refreshToken: string }, { email: string; password: string }>({
    mutationFn: ({ email, password }) =>
      authApi
        .signin(email, password)
        .then((r) => r.data as ApiEnvelope<{ accessToken: string; refreshToken: string }>),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken);
    },
  });
}