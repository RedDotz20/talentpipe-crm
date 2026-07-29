import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useSignIn() {
  const { setTokens } = useAuthStore();

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.signin(email, password),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken);
    },
  });
}