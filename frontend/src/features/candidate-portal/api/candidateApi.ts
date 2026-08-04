import { apiClient } from '@/api/client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type { Job, Application, Bookmark, Profile, ApplyData, CandidateSkills } from '@/features/candidate-portal/types';

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

const normalizeJob = (job: Job & { jobPostingId?: string }): Job => ({
  ...job,
  id: job.id ?? job.jobPostingId ?? '',
});

export const candidateApi = {
  getJobs: async (search?: string): Promise<Job[]> => {
    const { data } = await apiClient.get('/candidate/jobs', { params: { search } });
    return unwrap(data as ApiEnvelope<(Job & { jobPostingId?: string })[]>).map(normalizeJob);
  },

  getJobDetail: async (tenantId: string, jobId: string): Promise<Job> => {
    const { data } = await apiClient.get(`/candidate/jobs/${tenantId}/${jobId}`);
    return normalizeJob(unwrap(data as ApiEnvelope<Job & { jobPostingId?: string }>));
  },

  getApplications: async (): Promise<Application[]> => {
    const { data } = await apiClient.get('/candidate/applications');
    return unwrap(data as ApiEnvelope<Application[]>);
  },

  applyToJob: async (tenantId: string, jobId: string, applicationData: ApplyData): Promise<{ applicationId: string }> => {
    const { data } = await apiClient.post(`/candidate/jobs/${tenantId}/${jobId}/apply`, applicationData);
    return unwrap(data as ApiEnvelope<{ applicationId: string }>);
  },

  getBookmarks: async (): Promise<Bookmark[]> => {
    const { data } = await apiClient.get('/candidate/bookmarks');
    return unwrap(data as ApiEnvelope<Bookmark[]>);
  },

  addBookmark: async (tenantId: string, jobPostingId: string): Promise<Bookmark> => {
    const { data } = await apiClient.post('/candidate/bookmarks', { tenantId, jobPostingId });
    return unwrap(data as ApiEnvelope<Bookmark>);
  },

  removeBookmark: async (bookmarkId: string): Promise<void> => {
    await apiClient.delete(`/candidate/bookmarks/${bookmarkId}`);
  },

  getProfile: async (): Promise<Profile> => {
    const { data } = await apiClient.get('/candidate/profile');
    return unwrap(data as ApiEnvelope<Profile>);
  },

  getSkills: async (): Promise<CandidateSkills> => {
    const { data } = await apiClient.get('/candidate/skills');
    return unwrap(data as ApiEnvelope<CandidateSkills>);
  },

  setSkills: async (skillIds: string[]): Promise<CandidateSkills> => {
    const { data } = await apiClient.put('/candidate/skills', { skillIds });
    return unwrap(data as ApiEnvelope<CandidateSkills>);
  },

  updateProfile: async (profile: Omit<Profile, 'id' | 'skills' | 'resume' | 'createdAt'>): Promise<ApiEnvelope<Profile>> => {
    const { data } = await apiClient.put('/candidate/profile', profile);
    return data as ApiEnvelope<Profile>;
  },

  uploadResume: async (file: File): Promise<ApiEnvelope<NonNullable<Profile['resume']>>> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post('/candidate/resume', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data as ApiEnvelope<NonNullable<Profile['resume']>>;
  },

  removeResume: async (): Promise<void> => {
    await apiClient.delete('/candidate/resume');
  },
};
