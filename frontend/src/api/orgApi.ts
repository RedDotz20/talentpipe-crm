import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const orgApi = {
  getSettings: async (): Promise<OrgSettings> => {
    const { data } = await apiClient.get('/org');
    return unwrap(data as ApiEnvelope<OrgSettings>);
  },
  updateSettings: async (input: {
    name: string;
  }): Promise<ApiEnvelope<{ id: string; name: string }>> => {
    const { data } = await apiClient.patch('/org', input);
    return data as ApiEnvelope<{ id: string; name: string }>;
  },
};
