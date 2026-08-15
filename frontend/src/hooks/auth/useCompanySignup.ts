import { useApiMutation, type ApiEnvelope } from '@/hooks/useApiMutation';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useCompanySignup() {
  const { setTokens } = useAuthStore();

  return useApiMutation<
    { accessToken: string; refreshToken: string },
    { companyName: string; slug: string; email: string; password: string }
  >({
    mutationFn: (data) =>
      authApi
        .companySignup(data)
        .then((r) => r.data as ApiEnvelope<{ accessToken: string; refreshToken: string }>),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken);
    },
  });
}