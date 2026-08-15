import { useApiMutation, type ApiEnvelope } from '@/hooks/useApiMutation';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useCandidateSignup() {
  const { setTokens } = useAuthStore();

  return useApiMutation<
    { accessToken: string; refreshToken: string },
    {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      phone?: string;
    }
  >({
    mutationFn: (data) =>
      authApi
        .candidateSignup(data)
        .then((r) => r.data as ApiEnvelope<{ accessToken: string; refreshToken: string }>),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken);
    },
  });
}