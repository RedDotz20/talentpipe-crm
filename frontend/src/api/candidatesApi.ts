import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface Candidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export interface CreateCandidateInput {
  name: string;
  email?: string;
  phone?: string;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const candidatesApi = {
  list: async (): Promise<Candidate[]> => {
    const { data } = await apiClient.get('/candidates');
    return unwrap(data as ApiEnvelope<Candidate[]>);
  },
  get: async (id: string): Promise<Candidate> => {
    const { data } = await apiClient.get(`/candidates/${id}`);
    return unwrap(data as ApiEnvelope<Candidate>);
  },
  create: async (input: CreateCandidateInput): Promise<ApiEnvelope<Candidate>> => {
    const { data } = await apiClient.post('/candidates', input);
    return data as ApiEnvelope<Candidate>;
  },
};
