import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/api/platformApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function usePlatformPermissions() {
  return useQuery({
    queryKey: queryKeys.platform.permissions(),
    queryFn: platformApi.listPermissions,
  });
}

export function useCreatePlatformPreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: platformApi.createPermissionPreset,
    successMessage: 'Global preset created',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}

export function useUpdatePlatformPreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; permissions?: string[] } }) =>
      platformApi.updatePermissionPreset(id, body),
    successMessage: 'Global preset updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}

export function useDeletePlatformPreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: platformApi.deletePermissionPreset,
    successMessage: 'Global preset deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}

export function useBulkDeletePlatformPreset() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, string[]>({
    mutationFn: platformApi.deletePermissionPresetsMany,
    successMessage: 'Presets deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}

export function useSetPlatformPresetEnabled() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) => platformApi.setPermissionPresetEnabled(id, enabled),
    successMessage: 'Preset updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}

export function useBulkSetPlatformPresetEnabled() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, { ids: string[]; enabled: boolean }>({
    mutationFn: ({ ids, enabled }) => platformApi.bulkSetPermissionPresetsEnabled(ids, enabled),
    successMessage: 'Presets updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.permissions() });
    },
  });
}
