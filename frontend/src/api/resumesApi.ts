import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type { Skill } from './skillsApi';

export interface Resume {
  id: string;
  candidateId: string;
  fileUrl: string | null;
  parsedText: string | null;
  uploadedAt: string;
  skills: Skill[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const resumesApi = {
  get: async (candidateId: string): Promise<Resume> => {
    const { data } = await apiClient.get(`/candidates/${candidateId}/resume`);
    return unwrap(data as ApiEnvelope<Resume>);
  },
  upload: async (
    candidateId: string,
    file: File,
  ): Promise<ApiEnvelope<Resume>> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post(
      `/candidates/${candidateId}/resume`,
      formData,
      { headers: { 'Content-Type': undefined } },
    );
    return data as ApiEnvelope<Resume>;
  },
};
