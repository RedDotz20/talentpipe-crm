import { useQuery } from '@tanstack/react-query';
import { candidateApi } from '../api/candidateApi';

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  createdAt: string;
}

export function useProfile() {
  return useQuery({
    queryKey: ['candidate', 'profile'],
    queryFn: () => candidateApi.getProfile(),
    enabled: typeof window !== 'undefined',
  });
}