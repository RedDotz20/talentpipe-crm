import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface CompanySettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const companyApi = {
  getSettings: async (): Promise<CompanySettings> => {
    const { data } = await apiClient.get('/company');
    return unwrap(data as ApiEnvelope<CompanySettings>);
  },
  updateSettings: async (input: {
    name: string;
  }): Promise<ApiEnvelope<{ id: string; name: string }>> => {
    const { data } = await apiClient.patch('/company', input);
    return data as ApiEnvelope<{ id: string; name: string }>;
  },
};
