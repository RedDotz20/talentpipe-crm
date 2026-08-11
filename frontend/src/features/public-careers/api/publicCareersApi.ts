import { apiClient } from '@/api/client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface PublicSkill {
  id: string;
  name: string;
  category: string | null;
}

export interface PublicJobListing {
  id: string;
  companyId: string;
  companySlug: string;
  companyName: string;
  title: string;
  description: string | null;
  employmentType: string | null;
  location: string | null;
  workSetup: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicJobDetail extends PublicJobListing {
  requiredSkills: PublicSkill[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const publicCareersApi = {
  async getJobs(companySlug: string): Promise<PublicJobListing[]> {
    const { data } = await apiClient.get(
      `/public/${encodeURIComponent(companySlug)}/jobs`,
    );
    return unwrap(data as ApiEnvelope<PublicJobListing[]>);
  },

  async getJob(
    companySlug: string,
    jobId: string,
  ): Promise<PublicJobDetail> {
    const { data } = await apiClient.get(
      `/public/${encodeURIComponent(companySlug)}/jobs/${encodeURIComponent(jobId)}`,
    );
    return unwrap(data as ApiEnvelope<PublicJobDetail>);
  },
};
