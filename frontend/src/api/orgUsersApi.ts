import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface OrgUser {
  id: string;
  email: string;
  role: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const orgUsersApi = {
  list: async (): Promise<OrgUser[]> => {
    const { data } = await apiClient.get('/org/users');
    return unwrap(data as ApiEnvelope<OrgUser[]>);
  },
};
