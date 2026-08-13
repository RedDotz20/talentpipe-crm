import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type { ListQueryParams, Paginated } from '@/shared/types/listQuery';
import type { TimeSeries } from '@/shared/types/dashboard';
import type { PermissionPreset } from './permissionsApi';

export interface PlatformCompany {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface CompanyDetail extends PlatformCompany {
  users: number;
  applications: number;
}

export interface PlatformStats {
  companies: number;
  users: number;
  applications: number;
}

export interface PlatformDashboard {
  companies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  users: number;
  applications: number;
  jobs: number;
  companiesOverTime: TimeSeries;
  applicationsPerCompany: Array<{ companyName: string; count: number }>;
  usersPerCompany: Array<{ companyName: string; count: number }>;
  jobsByStatusPerCompany: Array<{
    companyName: string;
    draft: number;
    open: number;
    closed: number;
  }>;
}

export interface PlatformUser {
  type: 'company' | 'candidate';
  id: string;
  email: string;
  role: string;
  status: 'active' | 'suspended' | null;
  companyId: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  presetId: string | null;
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
  companyId: string;
  companyName: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  stageName: string;
  appliedAt: string;
  matchScore: number | null;
}

export interface PlatformInterview {
  id: string;
  companyId: string;
  companyName: string;
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

export interface PlatformJob {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  description: string | null;
  employmentType: string | null;
  location: string | null;
  workSetup: string | null;
  status: 'draft' | 'open' | 'closed';
  createdAt: string;
  requiredSkillIds: string[];
}

export interface CreatePlatformJobInput {
  companyId: string;
  title: string;
  description?: string;
  employmentType: string;
  location: string;
  workSetup: string;
  requiredSkillIds?: string[];
}

export interface UpdatePlatformJobInput {
  title?: string;
  description?: string | null;
  employmentType?: string;
  location?: string;
  workSetup?: string;
  requiredSkillIds?: string[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const platformApi = {
  listCompanies: async (params?: ListQueryParams & { status?: string }): Promise<Paginated<PlatformCompany>> => {
    const { data } = await apiClient.get('/platform/companies', { params });
    return unwrap(data as ApiEnvelope<Paginated<PlatformCompany>>);
  },
  exportCompanies: async (params?: { search?: string; status?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/companies/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportUsers: async (params?: { search?: string; type?: string; companyId?: string; role?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/users/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportApplications: async (params?: { search?: string; companyId?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/applications/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportInterviews: async (params?: { search?: string; companyId?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/interviews/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  exportJobs: async (params?: { search?: string; companyId?: string; status?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/platform/jobs/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  getCompany: async (id: string): Promise<CompanyDetail> => {
    const { data } = await apiClient.get(`/platform/companies/${id}`);
    return unwrap(data as ApiEnvelope<CompanyDetail>);
  },
  setStatus: async (
    id: string,
    status: 'active' | 'suspended',
  ): Promise<ApiEnvelope<PlatformCompany>> => {
    const { data } = await apiClient.patch(
      `/platform/companies/${id}/${status === 'suspended' ? 'suspend' : 'reactivate'}`,
    );
    return data as ApiEnvelope<PlatformCompany>;
  },
  getStats: async (): Promise<PlatformStats> => {
    const { data } = await apiClient.get('/platform/stats');
    return unwrap(data as ApiEnvelope<PlatformStats>);
  },
  getDashboard: async (): Promise<PlatformDashboard> => {
    const { data } = await apiClient.get('/platform/dashboard');
    return unwrap(data as ApiEnvelope<PlatformDashboard>);
  },
  listUsers: async (params?: ListQueryParams & { type?: string; companyId?: string; role?: string }): Promise<Paginated<PlatformUser>> => {
    const { data } = await apiClient.get('/platform/users', { params });
    return unwrap(data as ApiEnvelope<Paginated<PlatformUser>>);
  },
  deleteCompany: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/companies/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  listCompanyUsers: async (companyId: string): Promise<PlatformUser[]> => {
    const { data } = await apiClient.get(`/platform/companies/${companyId}/users`);
    return unwrap(data as ApiEnvelope<PlatformUser[]>);
  },
  createCompanyUser: async (
    companyId: string,
    body: { email: string; role: string; password: string },
  ): Promise<ApiEnvelope<{ id: string; email: string; role: string }>> => {
    const { data } = await apiClient.post(`/platform/companies/${companyId}/users`, body);
    return data as ApiEnvelope<{ id: string; email: string; role: string }>;
  },
  updateCompanyUser: async (
    companyId: string,
    userId: string,
    body: { role?: string; password?: string },
  ): Promise<ApiEnvelope<{ id: string; email: string; role: string }>> => {
    const { data } = await apiClient.patch(`/platform/companies/${companyId}/users/${userId}`, body);
    return data as ApiEnvelope<{ id: string; email: string; role: string }>;
  },
  setCompanyUserStatus: async (
    companyId: string,
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<ApiEnvelope<{ id: string; email: string; role: string; status: string }>> => {
    const { data } = await apiClient.patch(
      `/platform/companies/${companyId}/users/${userId}/${status === 'suspended' ? 'suspend' : 'reactivate'}`,
    );
    return data as ApiEnvelope<{ id: string; email: string; role: string; status: string }>;
  },
  removeCompanyUser: async (companyId: string, userId: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/companies/${companyId}/users/${userId}`);
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
  listApplications: async (params?: ListQueryParams & { companyId?: string; status?: string }): Promise<Paginated<PlatformApplication>> => {
    const { data } = await apiClient.get('/platform/applications', { params });
    return unwrap(data as ApiEnvelope<Paginated<PlatformApplication>>);
  },
  moveApplicationStage: async (
    id: string,
    stageId: string,
  ): Promise<ApiEnvelope<Omit<PlatformApplication, 'companyId' | 'companyName'>>> => {
    const { data } = await apiClient.patch(`/platform/applications/${id}/stage`, { stageId });
    return data as ApiEnvelope<Omit<PlatformApplication, 'companyId' | 'companyName'>>;
  },
  listInterviews: async (params?: ListQueryParams & { companyId?: string; status?: string }): Promise<Paginated<PlatformInterview>> => {
    const { data } = await apiClient.get('/platform/interviews', { params });
    return unwrap(data as ApiEnvelope<Paginated<PlatformInterview>>);
  },
  rescheduleInterview: async (
    id: string,
    body: { scheduledAt?: string; status?: string },
  ): Promise<ApiEnvelope<{ id: string; applicationId: string; interviewerId: string; scheduledAt: string; status: string }>> => {
    const { data } = await apiClient.patch(`/platform/interviews/${id}`, body);
    return data as ApiEnvelope<{ id: string; applicationId: string; interviewerId: string; scheduledAt: string; status: string }>;
  },
  listCompanyStages: async (companyId: string): Promise<PlatformStage[]> => {
    const { data } = await apiClient.get(`/platform/companies/${companyId}/pipeline-stages`);
    return unwrap(data as ApiEnvelope<PlatformStage[]>);
  },
  listJobs: async (params?: ListQueryParams & { companyId?: string; status?: string }): Promise<Paginated<PlatformJob>> => {
    const { data } = await apiClient.get('/platform/jobs', { params });
    return unwrap(data as ApiEnvelope<Paginated<PlatformJob>>);
  },
  getJob: async (id: string): Promise<PlatformJob> => {
    const { data } = await apiClient.get(`/platform/jobs/${id}`);
    return unwrap(data as ApiEnvelope<PlatformJob>);
  },
  createJob: async (input: CreatePlatformJobInput): Promise<ApiEnvelope<PlatformJob>> => {
    const { data } = await apiClient.post('/platform/jobs', input);
    return data as ApiEnvelope<PlatformJob>;
  },
  updateJob: async (id: string, input: UpdatePlatformJobInput): Promise<ApiEnvelope<PlatformJob>> => {
    const { data } = await apiClient.patch(`/platform/jobs/${id}`, input);
    return data as ApiEnvelope<PlatformJob>;
  },
  publishJob: async (id: string): Promise<ApiEnvelope<PlatformJob>> => {
    const { data } = await apiClient.post(`/platform/jobs/${id}/publish`);
    return data as ApiEnvelope<PlatformJob>;
  },
  closeJob: async (id: string): Promise<ApiEnvelope<PlatformJob>> => {
    const { data } = await apiClient.post(`/platform/jobs/${id}/close`);
    return data as ApiEnvelope<PlatformJob>;
  },
  deleteJob: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/jobs/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  listPermissions: async (): Promise<{ presets: Array<PermissionPreset & { companyId: string | null; companyName: string | null }> }> => {
    const { data } = await apiClient.get('/platform/permissions');
    return unwrap(data as ApiEnvelope<{ presets: Array<PermissionPreset & { companyId: string | null; companyName: string | null }> }>);
  },
  createPermissionPreset: async (body: { name: string; role: string; permissions: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.post('/platform/permissions', body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  updatePermissionPreset: async (id: string, body: { name?: string; permissions?: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.patch(`/platform/permissions/${id}`, body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  deletePermissionPreset: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/platform/permissions/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  assignUserPreset: async (
    companyId: string,
    userId: string,
    presetId: string | null,
  ): Promise<ApiEnvelope<{ id: string; presetId: string | null }>> => {
    const { data } = await apiClient.patch(
      `/platform/companies/${companyId}/users/${userId}/preset`,
      { presetId },
    );
    return data as ApiEnvelope<{ id: string; presetId: string | null }>;
  },
};
