import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import {
  publicCareersApi,
  type PublicJobDetail,
  type PublicJobListing,
} from '../api/publicCareersApi';

export function usePublicJobs(companySlug: string) {
  return useQuery<PublicJobListing[]>({
    queryKey: queryKeys.publicCareers.jobs(companySlug),
    queryFn: () => publicCareersApi.getJobs(companySlug),
    enabled: Boolean(companySlug),
  });
}

export function usePublicJob(companySlug: string, jobId: string) {
  return useQuery<PublicJobDetail>({
    queryKey: queryKeys.publicCareers.job(companySlug, jobId),
    queryFn: () => publicCareersApi.getJob(companySlug, jobId),
    enabled: Boolean(companySlug && jobId),
  });
}
