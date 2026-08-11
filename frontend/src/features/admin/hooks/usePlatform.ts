import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/api/platformApi';
import {
  queryKeys,
  type PlatformAppsJobsParams,
  type PlatformCompaniesParams,
  type PlatformUsersParams,
} from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';

export function usePlatformCompanies(params?: PlatformCompaniesParams) {
  return useQuery({
    queryKey: queryKeys.platform.companies(params),
    queryFn: () => platformApi.listCompanies(params),
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: queryKeys.platform.stats(),
    queryFn: platformApi.getStats,
  });
}

export function usePlatformUsers(params?: PlatformUsersParams) {
  return useQuery({
    queryKey: queryKeys.platform.users(params),
    queryFn: () => platformApi.listUsers(params),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.deleteCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companies() });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.stats() });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
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

export function usePlatformApplications(params?: PlatformAppsJobsParams) {
  return useQuery({
    queryKey: queryKeys.platform.applications(params),
    queryFn: () => platformApi.listApplications(params),
  });
}

export function usePlatformInterviews(params?: PlatformAppsJobsParams) {
  return useQuery({
    queryKey: queryKeys.platform.interviews(params),
    queryFn: () => platformApi.listInterviews(params),
  });
}

export function useCreateCompanyUser(companyId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: { email: string; role: string; password: string }) =>
      platformApi.createCompanyUser(companyId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companyUsers(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
    },
  });
}

export function useRemoveCompanyUser(companyId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (userId: string) => platformApi.removeCompanyUser(companyId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.companyUsers(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
    },
  });
}

export function useRemoveCandidate() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.removeCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.candidates() });
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() });
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

export function usePlatformJobs(params?: PlatformAppsJobsParams) {
  return useQuery({
    queryKey: queryKeys.platform.jobs(params),
    queryFn: () => platformApi.listJobs(params),
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (input: import('@/api/platformApi').CreatePlatformJobInput) =>
      platformApi.createJob(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'jobs'] });
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({ id, input }: { id: string; input: import('@/api/platformApi').UpdatePlatformJobInput }) =>
      platformApi.updateJob(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'jobs'] });
    },
  });
}

export function usePublishJob() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.publishJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'jobs'] });
    },
  });
}

export function useCloseJob() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.closeJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'jobs'] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => platformApi.deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'jobs'] });
    },
  });
}
