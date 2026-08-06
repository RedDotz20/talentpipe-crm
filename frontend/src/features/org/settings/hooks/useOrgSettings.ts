import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orgApi } from '@/api/orgApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useOrgSettings() {
  return useQuery({
    queryKey: queryKeys.org.orgSettings(),
    queryFn: orgApi.getSettings,
  });
}

export function useUpdateOrgSettings() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: orgApi.updateSettings,
    successMessage: 'Company settings updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.orgSettings() });
    },
  });
}
