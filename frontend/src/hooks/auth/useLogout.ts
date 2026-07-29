import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useLogout() {
  const { clearTokens } = useAuthStore();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      clearTokens();
    },
    onError: (error) => {
      console.error('Logout failed:', error);
      clearTokens();
    },
  });
}