import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useCompanySignup() {
  const { setTokens } = useAuthStore();

  return useMutation({
    mutationFn: (data: {
      companyName: string;
      slug: string;
      email: string;
      password: string;
    }) => authApi.companySignup(data),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken);
    },
  });
}