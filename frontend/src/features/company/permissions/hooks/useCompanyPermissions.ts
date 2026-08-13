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
