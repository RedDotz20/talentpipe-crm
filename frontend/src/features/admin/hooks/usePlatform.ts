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

export function useTenantUsers(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.platform.tenantUsers(tenantId),
    queryFn: () => platformApi.listTenantUsers(tenantId),
    enabled: !!tenantId,
  });
}

export function usePlatformStages(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.platform.tenantStages(tenantId),
    queryFn: () => platformApi.listTenantStages(tenantId),
    enabled: !!tenantId,
  });
}

export function usePlatformCandidates() {
  return useQuery({
    queryKey: queryKeys.platform.candidates(),
    queryFn: platformApi.listCandidates,
  });
}

export function usePlatformApplications(filters?: { tenantId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.applications(filters),
    queryFn: () => platformApi.listApplications(filters),
  });
}

export function usePlatformInterviews(filters?: { tenantId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.interviews(filters),
    queryFn: () => platformApi.listInterviews(filters),
  });
}

export function useCreateTenantUser(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: { email: string; role: string; password: string }) =>
      platformApi.createTenantUser(tenantId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useUpdateTenantUser(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ userId, body }: { userId: string; body: { role?: string; password?: string } }) =>
      platformApi.updateTenantUser(tenantId, userId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useSetTenantUserStatus(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'suspended' }) =>
      platformApi.setTenantUserStatus(tenantId, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useRemoveTenantUser(tenantId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (userId: string) => platformApi.removeTenantUser(tenantId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.tenantUsers(tenantId) });
    },
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: { email: string; password: string; firstName: string; lastName: string; phone?: string }) =>
      platformApi.createCandidate(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.candidates() });
    },
  });
}

export function useUpdateCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { email?: string; password?: string; firstName?: string; lastName?: string; phone?: string | null } }) =>
      platformApi.updateCandidate(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.candidates() });
    },
  });
}

export function useRemoveCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.removeCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.candidates() });
    },
  });
}

export function useMoveApplicationStage() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) =>
      platformApi.moveApplicationStage(id, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.applications() });
    },
  });
}

export function useRescheduleInterview() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { scheduledAt?: string; status?: string } }) =>
      platformApi.rescheduleInterview(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.interviews() });
    },
  });
}
