import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export const INTERNAL_USER_ROLES = [
  'OrgAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
] as const;

export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

export interface OrgUser {
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

export const orgUsersApi = {
  list: async (): Promise<OrgUser[]> => {
    const { data } = await apiClient.get('/org/users');
    return unwrap(data as ApiEnvelope<OrgUser[]>);
  },
  invite: async (input: InviteUserInput): Promise<ApiEnvelope<OrgUser>> => {
    const { data } = await apiClient.post('/org/users/invite', input);
    return data as ApiEnvelope<OrgUser>;
  },
  updateRole: async (
    userId: string,
    role: InternalUserRole,
  ): Promise<ApiEnvelope<OrgUser>> => {
    const { data } = await apiClient.patch(`/org/users/${userId}/role`, { role });
    return data as ApiEnvelope<OrgUser>;
  },
  remove: async (userId: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/org/users/${userId}`);
    return data as ApiEnvelope<{ id: string }>;
  },
};
