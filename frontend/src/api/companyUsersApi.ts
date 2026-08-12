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
  email: string;
  role: string;
  status: 'active' | 'suspended';
  createdAt?: string;
}

export interface CreateUserInput {
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
  remove: async (userId: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/company/users/${userId}`);
    return data as ApiEnvelope<{ id: string }>;
  },
};
