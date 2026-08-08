import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const pipelineStagesApi = {
  list: async (): Promise<PipelineStage[]> => {
    const { data } = await apiClient.get('/company/pipeline-stages');
    return unwrap(data as ApiEnvelope<PipelineStage[]>);
  },
  create: async (name: string): Promise<ApiEnvelope<PipelineStage>> => {
    const { data } = await apiClient.post('/company/pipeline-stages', { name });
    return data as ApiEnvelope<PipelineStage>;
  },
  update: async (
    id: string,
    input: { name?: string; order?: number },
  ): Promise<ApiEnvelope<PipelineStage>> => {
    const { data } = await apiClient.patch(`/company/pipeline-stages/${id}`, input);
    return data as ApiEnvelope<PipelineStage>;
  },
  remove: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/company/pipeline-stages/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
};
