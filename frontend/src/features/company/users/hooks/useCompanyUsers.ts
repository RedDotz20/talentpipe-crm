import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companyUsersApi } from '@/api/companyUsersApi';
import type { InternalUserRole, CreateUserInput } from '@/api/companyUsersApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useCompanyUsers() {
  return useQuery({
    queryKey: queryKeys.company.companyUsers(),
    queryFn: companyUsersApi.list,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, CreateUserInput>({
    mutationFn: companyUsersApi.create,
    successMessage: 'Account created',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companyUsers() });
    },
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, { userId: string; status: 'active' | 'suspended' }>({
    mutationFn: ({ userId, status }) => companyUsersApi.setStatus(userId, status),
    successMessage: 'Account status updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companyUsers() });
    },
  });
}

export function useResetUserPassword() {
  return useApiMutation<unknown, { userId: string; password: string }>({
    mutationFn: ({ userId, password }) =>
      companyUsersApi.resetPassword(userId, password),
    successMessage: 'Password reset — the user must sign in with the new password',
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

export function useAssignPreset() {
  const queryClient = useQueryClient();
  return useApiMutation<
    unknown,
    { userId: string; presetId: string | null }
  >({
    mutationFn: ({ userId, presetId }) =>
      companyUsersApi.assignPreset(userId, presetId),
    successMessage: 'Preset assigned',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.companyUsers() });
    },
  });
}
