import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type { ListQueryParams, Paginated } from '@/shared/types/listQuery';

export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled';

export interface Interview {
  id: string;
  applicationId: string;
  interviewerId: string;
  scheduledAt: string;
  status: InterviewStatus;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  interviewerEmail: string;
  rating: number | null;
  comments: string | null;
  submittedAt: string | null;
}

export interface CreateInterviewInput {
  applicationId: string;
  interviewerId: string;
  scheduledAt: string;
}

export interface UpdateInterviewInput {
  scheduledAt?: string;
  status?: InterviewStatus;
}

export interface InterviewFeedback {
  id: string;
  interviewId: string;
  rating: number;
  comments: string | null;
  submittedAt: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const interviewsApi = {
  list: async (params?: ListQueryParams & { status?: string }): Promise<Paginated<Interview>> => {
    const { data } = await apiClient.get('/interviews', { params });
    return unwrap(data as ApiEnvelope<Paginated<Interview>>);
  },
  exportCsv: async (params?: { search?: string; status?: string }): Promise<Blob> => {
    const { data } = await apiClient.get('/interviews/export', { params, responseType: 'blob' });
    return data as Blob;
  },
  get: async (id: string): Promise<Interview> => {
    const { data } = await apiClient.get(`/interviews/${id}`);
    return unwrap(data as ApiEnvelope<Interview>);
  },
  create: async (
    input: CreateInterviewInput,
  ): Promise<ApiEnvelope<Interview>> => {
    const { data } = await apiClient.post('/interviews', input);
    return data as ApiEnvelope<Interview>;
  },
  update: async (
    id: string,
    input: UpdateInterviewInput,
  ): Promise<ApiEnvelope<Interview>> => {
    const { data } = await apiClient.patch(`/interviews/${id}`, input);
    return data as ApiEnvelope<Interview>;
  },
  submitFeedback: async (
    id: string,
    input: { rating: number; comments?: string },
  ): Promise<ApiEnvelope<InterviewFeedback>> => {
    const { data } = await apiClient.post(`/interviews/${id}/feedback`, input);
    return data as ApiEnvelope<InterviewFeedback>;
  },
};
