import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companyApi } from '@/api/companyApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useCompanySettings() {
  return useQuery({
    queryKey: queryKeys.company.companySettings(),
    queryFn: companyApi.getSettings,
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: companyApi.updateSettings,
    successMessage: 'Company settings updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companySettings() });
    },
  });
}
