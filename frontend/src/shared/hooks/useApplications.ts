import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';

export interface Application {
  id: string;
  jobTitle: string;
  companyName: string;
  status: string;
  appliedAt: string;
}

export function useApplications() {
  return useQuery({
    queryKey: ['candidate', 'applications'],
    queryFn: () => candidateApi.getApplications(),
    enabled: typeof window !== 'undefined',
  });
}