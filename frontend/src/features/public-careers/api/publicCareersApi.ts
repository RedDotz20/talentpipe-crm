import { apiClient } from '@/api/client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface PublicSkill {
  id: string;
  name: string;
  category: string | null;
}

export interface PublicJobListing {
  id: string;
  tenantId: string;
  tenantSlug: string;
  companyName: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicJobDetail extends PublicJobListing {
  requiredSkills: PublicSkill[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const publicCareersApi = {
  async getJobs(tenantSlug: string): Promise<PublicJobListing[]> {
    const { data } = await apiClient.get(
      `/public/${encodeURIComponent(tenantSlug)}/jobs`,
    );
    return unwrap(data as ApiEnvelope<PublicJobListing[]>);
  },

  async getJob(
    tenantSlug: string,
    jobId: string,
  ): Promise<PublicJobDetail> {
    const { data } = await apiClient.get(
      `/public/${encodeURIComponent(tenantSlug)}/jobs/${encodeURIComponent(jobId)}`,
    );
    return unwrap(data as ApiEnvelope<PublicJobDetail>);
  },
};
