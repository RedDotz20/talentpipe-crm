import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export const INTERNAL_USER_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
] as const;

export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

export interface CompanyUser {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
  status: 'active' | 'suspended';
  presetId: string | null;
  createdAt?: string;
}

export interface CreateUserInput {
  name?: string;
  email: string;
  role: InternalUserRole;
  password: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const companyUsersApi = {
  list: async (): Promise<CompanyUser[]> => {
    const { data } = await apiClient.get('/company/users');
    return unwrap(data as ApiEnvelope<CompanyUser[]>);
  },
  exportCsv: async (): Promise<Blob> => {
    const { data } = await apiClient.get('/company/users/export', { responseType: 'blob' });
    return data as Blob;
  },
  create: async (input: CreateUserInput): Promise<ApiEnvelope<CompanyUser>> => {
    const { data } = await apiClient.post('/company/users', input);
    return data as ApiEnvelope<CompanyUser>;
  },
  updateRole: async (
    userId: string,
    role: InternalUserRole,
  ): Promise<ApiEnvelope<CompanyUser>> => {
    const { data } = await apiClient.patch(`/company/users/${userId}/role`, { role });
    return data as ApiEnvelope<CompanyUser>;
  },
  setStatus: async (
    userId: string,
    status: 'active' | 'suspended',
  ): Promise<ApiEnvelope<CompanyUser>> => {
    const { data } = await apiClient.patch(
      `/company/users/${userId}/${status === 'suspended' ? 'suspend' : 'reactivate'}`,
    );
    return data as ApiEnvelope<CompanyUser>;
  },
  resetPassword: async (
    userId: string,
    password: string,
  ): Promise<ApiEnvelope<{ id: string; email: string }>> => {
    const { data } = await apiClient.patch(`/company/users/${userId}/password`, {
      password,
    });
    return data as ApiEnvelope<{ id: string; email: string }>;
  },
  remove: async (userId: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/company/users/${userId}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  assignPreset: async (
    userId: string,
    presetId: string | null,
  ): Promise<ApiEnvelope<{ id: string; presetId: string | null }>> => {
    const { data } = await apiClient.patch(`/company/users/${userId}/preset`, {
      presetId,
    });
    return data as ApiEnvelope<{ id: string; presetId: string | null }>;
  },
};
