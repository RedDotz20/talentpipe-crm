import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface JobPosting {
  id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'open' | 'closed';
  createdByUserId: string | null;
  createdAt: string;
  requiredSkillIds: string[];
}

export interface CreateJobPostingInput {
  title: string;
  description?: string;
  requiredSkillIds?: string[];
}

export interface UpdateJobPostingInput {
  title?: string;
  description?: string | null;
  requiredSkillIds?: string[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const jobPostingsApi = {
  list: async (status?: string): Promise<JobPosting[]> => {
    const { data } = await apiClient.get('/job-postings', { params: { status } });
    return unwrap(data as ApiEnvelope<JobPosting[]>);
  },
  get: async (id: string): Promise<JobPosting> => {
    const { data } = await apiClient.get(`/job-postings/${id}`);
    return unwrap(data as ApiEnvelope<JobPosting>);
  },
  create: async (input: CreateJobPostingInput): Promise<ApiEnvelope<JobPosting>> => {
    const { data } = await apiClient.post('/job-postings', input);
    return data as ApiEnvelope<JobPosting>;
  },
  update: async (id: string, input: UpdateJobPostingInput): Promise<ApiEnvelope<JobPosting>> => {
    const { data } = await apiClient.patch(`/job-postings/${id}`, input);
    return data as ApiEnvelope<JobPosting>;
  },
  publish: async (id: string): Promise<ApiEnvelope<JobPosting>> => {
    const { data } = await apiClient.post(`/job-postings/${id}/publish`);
    return data as ApiEnvelope<JobPosting>;
  },
  close: async (id: string): Promise<ApiEnvelope<JobPosting>> => {
    const { data } = await apiClient.post(`/job-postings/${id}/close`);
    return data as ApiEnvelope<JobPosting>;
  },
  remove: async (id: string): Promise<ApiEnvelope<null>> => {
    const { data } = await apiClient.delete(`/job-postings/${id}`);
    return data as ApiEnvelope<null>;
  },
};
