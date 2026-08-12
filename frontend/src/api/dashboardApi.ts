import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type { TimeSeries } from '@/shared/types/dashboard';

export interface DashboardSummary {
  totalApplications: number;
  totalCandidates: number;
  openJobPostings: number;
  applicationsByStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
  }>;
  applicationsOverTime: TimeSeries;
  topJobsByApplications: Array<{ title: string; count: number }>;
  interviewStatusBreakdown: Array<{ status: string; count: number }>;
  jobsByStatus: Array<{ status: string; count: number }>;
  jobsByEmploymentType: Array<{ type: string; count: number }>;
  rejection: { rejected: number; total: number };
}

export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const { data } = await apiClient.get('/dashboard/summary');
    return (data as ApiEnvelope<DashboardSummary>).data;
  },
};
