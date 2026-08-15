import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface CompanyProfile {
  id: string;
  email: string;
  role: string;
  name: string | null;
  avatarUrl: string | null;
  status: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const companyProfileApi = {
  get: async (): Promise<CompanyProfile> => {
    const { data } = await apiClient.get('/company/profile');
    return unwrap(data as ApiEnvelope<CompanyProfile>);
  },
  update: async (name: string): Promise<CompanyProfile> => {
    const { data } = await apiClient.put('/company/profile', { name });
    return unwrap(data as ApiEnvelope<CompanyProfile>);
  },
  uploadAvatar: async (file: File): Promise<{ avatarUrl: string | null }> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post('/company/profile/avatar', formData, {
      headers: { 'Content-Type': undefined },
    });
    return unwrap(data as ApiEnvelope<{ avatarUrl: string | null }>);
  },
  removeAvatar: async (): Promise<{ avatarUrl: null }> => {
    const { data } = await apiClient.delete('/company/profile/avatar');
    return unwrap(data as ApiEnvelope<{ avatarUrl: null }>);
  },
};
