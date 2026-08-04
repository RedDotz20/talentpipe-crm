import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface DashboardSummary {
  totalApplications: number;
  totalCandidates: number;
  openJobPostings: number;
  applicationsByStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
  }>;
}

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const { data } = await apiClient.get('/dashboard/summary');
    return (data as ApiEnvelope<DashboardSummary>).data;
  },
};
