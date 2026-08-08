import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/api/platformApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function usePlatformCompanies() {
  return useQuery({
    queryKey: queryKeys.platform.companies(),
    queryFn: platformApi.listCompanies,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: queryKeys.platform.stats(),
    queryFn: platformApi.getStats,
  });
}

export function useCompanyDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.platform.company(id),
    queryFn: () => platformApi.getCompany(id),
    enabled: !!id,
  });
}

export function useSetCompanyStatus() {
  const queryClient = useQueryClient();
  return useApiMutation<
    { id: string; status: string },
    { id: string; status: 'active' | 'suspended' }
  >({
    mutationFn: ({ id, status }) => platformApi.setStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companies() });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.stats() });
    },
  });
}

export function useCompanyUsers(companyId: string) {
  return useQuery({
    queryKey: queryKeys.platform.companyUsers(companyId),
    queryFn: () => platformApi.listCompanyUsers(companyId),
    enabled: !!companyId,
  });
}

export function usePlatformStages(companyId: string) {
  return useQuery({
    queryKey: queryKeys.platform.companyStages(companyId),
    queryFn: () => platformApi.listCompanyStages(companyId),
    enabled: !!companyId,
  });
}

export function usePlatformCandidates() {
  return useQuery({
    queryKey: queryKeys.platform.candidates(),
    queryFn: platformApi.listCandidates,
  });
}

export function usePlatformApplications(filters?: { companyId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.applications(filters),
    queryFn: () => platformApi.listApplications(filters),
  });
}

export function usePlatformInterviews(filters?: { companyId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.platform.interviews(filters),
    queryFn: () => platformApi.listInterviews(filters),
  });
}

export function useCreateCompanyUser(companyId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: { email: string; role: string; password: string }) =>
      platformApi.createCompanyUser(companyId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companyUsers(companyId) });
    },
  });
}

export function useUpdateCompanyUser(companyId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ userId, body }: { userId: string; body: { role?: string; password?: string } }) =>
      platformApi.updateCompanyUser(companyId, userId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companyUsers(companyId) });
    },
  });
}

export function useSetCompanyUserStatus(companyId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'suspended' }) =>
      platformApi.setCompanyUserStatus(companyId, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companyUsers(companyId) });
    },
  });
}

export function useRemoveCompanyUser(companyId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (userId: string) => platformApi.removeCompanyUser(companyId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companyUsers(companyId) });
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
      queryClient.invalidateQueries({ queryKey: ['platform', 'applications'] });
    },
  });
}

export function useRescheduleInterview() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: { scheduledAt?: string; status?: string } }) =>
      platformApi.rescheduleInterview(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'interviews'] });
    },
  });
}
