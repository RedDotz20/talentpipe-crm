import { useQuery, useQueryClient } from '@tanstack/react-query';
import { candidateApi } from '@/features/candidate-portal/api/candidateApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation } from '@/hooks/useApiMutation';
import type { Profile } from '../types';

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.candidate.profile(),
    queryFn: () => candidateApi.getProfile(),
    enabled: typeof window !== 'undefined',
  });
}

type ProfileUpdate = Omit<Profile, 'id' | 'skills' | 'resumeFileUrl' | 'resumeUploadedAt' | 'createdAt'>;

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (profile: ProfileUpdate) => candidateApi.updateProfile(profile),
    successMessage: 'Profile updated',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.candidate.profile() }),
  });
}

export function useUploadResume() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (file: File) => candidateApi.uploadResume(file),
    successMessage: 'Resume uploaded',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.candidate.profile() }),
  });
}

export function useRemoveResume() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => candidateApi.removeResume().then(() => ({ data: undefined, message: 'Resume removed' })),
    successMessage: 'Resume removed',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.candidate.profile() }),
  });
}
