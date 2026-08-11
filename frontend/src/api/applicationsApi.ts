import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface ApplicationNote {
  id: string;
  applicationId: string;
  authorUserId: string;
  content: string;
  createdAt: string;
}

export interface Application {
  id: string;
  candidateId: string;
  jobPostingId: string;
  currentStageId: string | null;
  matchScore: number | null;
  appliedAt: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  stageName: string | null;
  notes?: ApplicationNote[];
}

export interface ApplicationFilters {
  jobPostingId?: string;
  stageId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const applicationsApi = {
  list: async (filters?: ApplicationFilters): Promise<Application[]> => {
    const { data } = await apiClient.get('/applications', { params: filters });
    return unwrap(data as ApiEnvelope<Application[]>);
  },
  get: async (id: string): Promise<Application> => {
    const { data } = await apiClient.get(`/applications/${id}`);
    return unwrap(data as ApiEnvelope<Application>);
  },
  updateStage: async (
    applicationId: string,
    stageId: string,
  ): Promise<ApiEnvelope<Application>> => {
    const { data } = await apiClient.patch(
      `/applications/${applicationId}/stage`,
      { stageId },
    );
    return data as ApiEnvelope<Application>;
  },
  createNote: async (
    applicationId: string,
    content: string,
  ): Promise<ApiEnvelope<ApplicationNote>> => {
    const { data } = await apiClient.post(`/applications/${applicationId}/notes`, {
      content,
    });
    return data as ApiEnvelope<ApplicationNote>;
  },
  listNotes: async (applicationId: string): Promise<ApplicationNote[]> => {
    const { data } = await apiClient.get(`/applications/${applicationId}/notes`);
    return unwrap(data as ApiEnvelope<ApplicationNote[]>);
  },
};
