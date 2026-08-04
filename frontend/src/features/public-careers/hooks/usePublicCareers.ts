import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import {
  publicCareersApi,
  type PublicJobDetail,
  type PublicJobListing,
} from '../api/publicCareersApi';

export function usePublicJobs(tenantSlug: string) {
  return useQuery<PublicJobListing[]>({
    queryKey: queryKeys.publicCareers.jobs(tenantSlug),
    queryFn: () => publicCareersApi.getJobs(tenantSlug),
    enabled: Boolean(tenantSlug),
  });
}

export function usePublicJob(tenantSlug: string, jobId: string) {
  return useQuery<PublicJobDetail>({
    queryKey: queryKeys.publicCareers.job(tenantSlug, jobId),
    queryFn: () => publicCareersApi.getJob(tenantSlug, jobId),
    enabled: Boolean(tenantSlug && jobId),
  });
}
