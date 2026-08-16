import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';
import { queryClient } from '@/api/queryClient';

export function useLogout() {
  const { clearTokens } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: async () => {
      clearTokens();
      try {
        await navigate({ to: '/auth/signin' });
      } finally {
        // Wipe the cache only after the protected page has unmounted, so no
        // mounted query refetches unauthenticated and flashes a 401.
        queryClient.clear();
      }
    },
  });
}
