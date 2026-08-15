import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/api/platformApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function usePlatformProfile() {
  return useQuery({
    queryKey: queryKeys.platform.profile(),
    queryFn: platformApi.getProfile,
  });
}

export function useUpdatePlatformProfile() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (name: string) => platformApi.updateProfile(name),
    successMessage: 'Profile updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useUploadPlatformAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (file: File) => platformApi.uploadAvatar(file),
    successMessage: 'Avatar updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useRemovePlatformAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => platformApi.removeAvatar(),
    successMessage: 'Avatar removed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}
