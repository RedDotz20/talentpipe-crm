import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companyProfileApi } from '@/api/companyProfileApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useCompanyProfile() {
  return useQuery({
    queryKey: queryKeys.company.profile(),
    queryFn: companyProfileApi.get,
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (name: string) => companyProfileApi.update(name),
    successMessage: 'Profile updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useUploadCompanyAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (file: File) => companyProfileApi.uploadAvatar(file),
    successMessage: 'Avatar updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useRemoveCompanyAvatar() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => companyProfileApi.removeAvatar(),
    successMessage: 'Avatar removed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.profile() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}
