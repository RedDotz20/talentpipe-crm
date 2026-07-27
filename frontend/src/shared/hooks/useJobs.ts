import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';

export interface Job {
  id: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
}

export function useJobs() {
  return useQuery({
    queryKey: ['candidate', 'jobs'],
    queryFn: () => candidateApi.getJobs(),
    enabled: typeof window !== 'undefined',
  });
}