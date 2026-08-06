import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orgUsersApi } from '@/api/orgUsersApi';
import type { InternalUserRole, InviteUserInput } from '@/api/orgUsersApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function useOrgUsers() {
  return useQuery({
    queryKey: queryKeys.org.orgUsers(),
    queryFn: orgUsersApi.list,
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, InviteUserInput>({
    mutationFn: orgUsersApi.invite,
    successMessage: 'User invited',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.orgUsers() });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, { userId: string; role: InternalUserRole }>({
    mutationFn: ({ userId, role }) => orgUsersApi.updateRole(userId, role),
    successMessage: 'Role updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.orgUsers() });
    },
  });
}

export function useRemoveUser() {
  const queryClient = useQueryClient();
  return useApiMutation<unknown, string>({
    mutationFn: orgUsersApi.remove,
    successMessage: 'User removed',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.org.orgUsers() });
    },
  });
}
