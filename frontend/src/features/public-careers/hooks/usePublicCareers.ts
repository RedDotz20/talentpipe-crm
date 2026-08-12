import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import type { ListQueryParams, Paginated } from '@/shared/types/listQuery';
import {
  publicCareersApi,
  type PublicJobDetail,
  type PublicJobListing,
} from '../api/publicCareersApi';

export function usePublicJobs(
  companySlug: string | undefined,
  params?: ListQueryParams & { employmentType?: string; workSetup?: string },
) {
  return useQuery<Paginated<PublicJobListing>>({
    queryKey: companySlug
      ? queryKeys.publicCareers.jobs(companySlug, params)
      : queryKeys.publicCareers.allJobs(params),
    queryFn: () =>
      companySlug
        ? publicCareersApi.getJobs(companySlug, params)
        : publicCareersApi.getAllJobs(params),
  });
}

export function usePublicJob(companySlug: string, jobId: string) {
  return useQuery<PublicJobDetail>({
    queryKey: queryKeys.publicCareers.job(companySlug, jobId),
    queryFn: () => publicCareersApi.getJob(companySlug, jobId),
    enabled: Boolean(companySlug && jobId),
  });
}
