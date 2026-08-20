import { apiClient } from '@/api/client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type { ListQueryParams, Paginated } from '@/shared/types/listQuery';

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
  async getAllJobs(
    params?: ListQueryParams & { employmentType?: string; workSetup?: string },
  ): Promise<Paginated<PublicJobListing>> {
    const { data } = await apiClient.get('/public/jobs', { params });
    return unwrap(data as ApiEnvelope<Paginated<PublicJobListing>>);
  },

  async getJobs(
    companySlug: string,
    params?: ListQueryParams & { employmentType?: string; workSetup?: string },
  ): Promise<Paginated<PublicJobListing>> {
    const { data } = await apiClient.get(
      `/public/${encodeURIComponent(companySlug)}/jobs`,
      { params },
    );
    return unwrap(data as ApiEnvelope<Paginated<PublicJobListing>>);
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
