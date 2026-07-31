import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface Skill {
  id: string;
  name: string;
  category: string | null;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const skillsApi = {
  search: async (query?: string): Promise<Skill[]> => {
    const { data } = await apiClient.get('/skills', { params: { search: query } });
    return unwrap(data as ApiEnvelope<Skill[]>);
  },
};
