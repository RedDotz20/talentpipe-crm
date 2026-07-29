import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/authApi';
import { useAuthStore } from '../../api/useAuth';

export function useRefreshAuth() {
  const { setTokens, clearTokens } = useAuthStore();

  return useMutation({
    mutationFn: (refreshToken: string) => authApi.refreshAuth(refreshToken),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken ?? '');
    },
    onError: () => {
      clearTokens();
    },
  });
}