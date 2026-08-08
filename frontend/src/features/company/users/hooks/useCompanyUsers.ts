import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companyUsersApi } from '@/api/companyUsersApi';
import type { InternalUserRole, InviteUserInput } from '@/api/companyUsersApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useCompanyUsers() {
  return useQuery({
    queryKey: queryKeys.company.companyUsers(),
    queryFn: companyUsersApi.list,
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, InviteUserInput>({
    mutationFn: companyUsersApi.invite,
    successMessage: 'User invited',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companyUsers() });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, { userId: string; role: InternalUserRole }>({
    mutationFn: ({ userId, role }) => companyUsersApi.updateRole(userId, role),
    successMessage: 'Role updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companyUsers() });
    },
  });
}

export function useRemoveUser() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, string>({
    mutationFn: companyUsersApi.remove,
    successMessage: 'User removed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companyUsers() });
    },
  });
}
