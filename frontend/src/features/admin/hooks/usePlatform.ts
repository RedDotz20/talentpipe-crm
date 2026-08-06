import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/api/platformApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function usePlatformTenants() {
  return useQuery({
    queryKey: queryKeys.platform.tenants(),
    queryFn: platformApi.listTenants,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: queryKeys.platform.stats(),
    queryFn: platformApi.getStats,
  });
}

export function useTenantDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.platform.tenant(id),
    queryFn: () => platformApi.getTenant(id),
    enabled: !!id,
  });
}

export function useSetTenantStatus() {
  const queryClient = useQueryClient();
  return useApiMutation<
    { id: string; status: string },
    { id: string; status: 'active' | 'suspended' }
  >({
    mutationFn: ({ id, status }) => platformApi.setStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenants() });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.stats() });
    },
  });
}
