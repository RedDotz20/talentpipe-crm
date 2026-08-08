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
  createdAt?: string;
}

export interface InviteUserInput {
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
  invite: async (input: InviteUserInput): Promise<ApiEnvelope<CompanyUser>> => {
    const { data } = await apiClient.post('/company/users/invite', input);
    return data as ApiEnvelope<CompanyUser>;
  },
  updateRole: async (
    userId: string,
    role: InternalUserRole,
  ): Promise<ApiEnvelope<CompanyUser>> => {
    const { data } = await apiClient.patch(`/company/users/${userId}/role`, { role });
    return data as ApiEnvelope<CompanyUser>;
  },
  remove: async (userId: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/company/users/${userId}`);
    return data as ApiEnvelope<{ id: string }>;
  },
};
