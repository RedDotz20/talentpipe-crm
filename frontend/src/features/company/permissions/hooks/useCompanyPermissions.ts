import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companyPermissionsApi } from '@/api/permissionsApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useCompanyPermissionPresets() {
  return useQuery({
    queryKey: queryKeys.company.permissionPresets(),
    queryFn: companyPermissionsApi.list,
  });
}

export function useCreatePreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: companyPermissionsApi.create,
    successMessage: 'Preset created',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.permissionPresets(),
      });
    },
  });
}

export function useUpdatePreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; permissions?: string[] } }) =>
      companyPermissionsApi.update(id, body),
    successMessage: 'Preset updated',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.permissionPresets(),
      });
    },
  });
}

export function useDeletePreset() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: companyPermissionsApi.remove,
    successMessage: 'Preset deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.permissionPresets(),
      });
    },
  });
}

export function useBulkDeletePreset() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, string[]>({
    mutationFn: companyPermissionsApi.removeMany,
    successMessage: 'Presets deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.permissionPresets(),
      });
    },
  });
}

export function useSetPresetEnabled() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) => companyPermissionsApi.setEnabled(id, enabled),
    successMessage: 'Preset updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.permissionPresets() });
    },
  });
}

export function useBulkSetPresetEnabled() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, { ids: string[]; enabled: boolean }>({
    mutationFn: ({ ids, enabled }) => companyPermissionsApi.bulkSetEnabled(ids, enabled),
    successMessage: 'Presets updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.permissionPresets() });
    },
  });
}
