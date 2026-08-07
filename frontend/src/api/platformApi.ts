import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface TenantDetail extends PlatformTenant {
  users: number;
  applications: number;
}

export interface PlatformStats {
  tenants: number;
  users: number;
  applications: number;
}

export interface PlatformUser {
  id: string;
  email: string;
  role: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface PlatformCandidate {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: string;
}

export interface PlatformApplication {
  id: string;
  tenantId: string;
  tenantName: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  stageName: string;
  appliedAt: string;
  matchScore: number | null;
}

export interface PlatformInterview {
  id: string;
  tenantId: string;
  tenantName: string;
  candidateName: string;
  jobTitle: string;
  interviewerEmail: string;
  scheduledAt: string;
  status: string;
}

export interface PlatformStage {
  id: string;
  name: string;
  order: number;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const platformApi = {
  listTenants: async (): Promise<PlatformTenant[]> => {
    const { data } = await apiClient.get('/platform/tenants');
    return unwrap(data as ApiEnvelope<PlatformTenant[]>);
  },
  getTenant: async (id: string): Promise<TenantDetail> => {
    const { data } = await apiClient.get(`/platform/tenants/${id}`);
    return unwrap(data as ApiEnvelope<TenantDetail>);
  },
  setStatus: async (
    id: string,
    status: 'active' | 'suspended',
  ): Promise<ApiEnvelope<PlatformTenant>> => {
    const { data } = await apiClient.patch(
      `/platform/tenants/${id}/${status === 'suspended' ? 'suspend' : 'reactivate'}`,
    );
    return data as ApiEnvelope<PlatformTenant>;
  },
  getStats: async (): Promise<PlatformStats> => {
    const { data } = await apiClient.get('/platform/stats');
    return unwrap(data as ApiEnvelope<PlatformStats>);
  },
  listTenantUsers: async (tenantId: string): Promise<PlatformUser[]> => {
    const { data } = await apiClient.get(`/platform/tenants/${tenantId}/users`);
    return unwrap(data as ApiEnvelope<PlatformUser[]>);
  },
  createTenantUser: async (
    tenantId: string,
    body: { email: string; role: string; password: string },
  ): Promise<ApiEnvelope<{ id: string; email: string; role: string }>> => {
    const { data } = await apiClient.post(`/platform/tenants/${tenantId}/users`, body);
    return data as ApiEnvelope<{ id: string; email: string; role: string }>;
  },
  updateTenantUser: async (
    tenantId: string,
    userId: string,
    body: { role?: string; password?: string },
  ): Promise<ApiEnvelope<{ id: string; email: string; role: string }>> => {
    const { data } = await apiClient.patch(`/platform/tenants/${tenantId}/users/${userId}`, body);
    return data as ApiEnvelope<{ id: string; email: string; role: string }>;
  },
  setTenantUserStatus: async (
    tenantId: string,
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<ApiEnvelope<{ id: string; email: string; role: string; status: string }>> => {
    const { data } = await apiClient.patch(
      `/platform/tenants/${tenantId}/users/${userId}/${status === 'suspended' ? 'suspend' : 'reactivate'}`,
    );
    return data as ApiEnvelope<{ id: string; email: string; role: string; status: string }>;
  },
  removeTenantUser: async (tenantId: string, userId: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/tenants/${tenantId}/users/${userId}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  listCandidates: async (): Promise<PlatformCandidate[]> => {
    const { data } = await apiClient.get('/platform/candidates');
    return unwrap(data as ApiEnvelope<PlatformCandidate[]>);
  },
  createCandidate: async (
    body: { email: string; password: string; firstName: string; lastName: string; phone?: string },
  ): Promise<ApiEnvelope<PlatformCandidate>> => {
    const { data } = await apiClient.post('/platform/candidates', body);
    return data as ApiEnvelope<PlatformCandidate>;
  },
  updateCandidate: async (
    id: string,
    body: { email?: string; password?: string; firstName?: string; lastName?: string; phone?: string | null },
  ): Promise<ApiEnvelope<PlatformCandidate>> => {
    const { data } = await apiClient.patch(`/platform/candidates/${id}`, body);
    return data as ApiEnvelope<PlatformCandidate>;
  },
  removeCandidate: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/candidates/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  listApplications: async (filters?: { tenantId?: string; status?: string }): Promise<PlatformApplication[]> => {
    const { data } = await apiClient.get('/platform/applications', { params: filters });
    return unwrap(data as ApiEnvelope<PlatformApplication[]>);
  },
  moveApplicationStage: async (
    id: string,
    stageId: string,
  ): Promise<ApiEnvelope<Omit<PlatformApplication, 'tenantId' | 'tenantName'>>> => {
    const { data } = await apiClient.patch(`/platform/applications/${id}/stage`, { stageId });
    return data as ApiEnvelope<Omit<PlatformApplication, 'tenantId' | 'tenantName'>>;
  },
  listInterviews: async (filters?: { tenantId?: string; status?: string }): Promise<PlatformInterview[]> => {
    const { data } = await apiClient.get('/platform/interviews', { params: filters });
    return unwrap(data as ApiEnvelope<PlatformInterview[]>);
  },
  rescheduleInterview: async (
    id: string,
    body: { scheduledAt?: string; status?: string },
  ): Promise<ApiEnvelope<{ id: string; applicationId: string; interviewerId: string; scheduledAt: string; status: string }>> => {
    const { data } = await apiClient.patch(`/platform/interviews/${id}`, body);
    return data as ApiEnvelope<{ id: string; applicationId: string; interviewerId: string; scheduledAt: string; status: string }>;
  },
  listTenantStages: async (tenantId: string): Promise<PlatformStage[]> => {
    const { data } = await apiClient.get(`/platform/tenants/${tenantId}/pipeline-stages`);
    return unwrap(data as ApiEnvelope<PlatformStage[]>);
  },
};
