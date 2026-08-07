import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';
import { queryClient } from '@/api/queryClient';

export function useLogout() {
  const { clearTokens } = useAuthStore();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      clearTokens();
      queryClient.clear();
    },
    onError: (error) => {
      console.error('Logout failed:', error);
      clearTokens();
      queryClient.clear();
    },
  });
}
