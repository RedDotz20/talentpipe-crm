import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface Resume {
  id: string;
  candidateId: string;
  fileUrl: string | null;
  uploadedAt: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const resumesApi = {
  get: async (candidateId: string): Promise<Resume> => {
    const { data } = await apiClient.get(`/candidates/${candidateId}/resume`);
    return unwrap(data as ApiEnvelope<Resume>);
  },
  download: async (candidateId: string): Promise<string> => {
    const { data } = await apiClient.get(
      `/candidates/${candidateId}/resume/file`,
      { responseType: 'blob' },
    );
    return URL.createObjectURL(data as Blob);
  },
};
