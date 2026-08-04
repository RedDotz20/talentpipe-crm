import { apiClient } from '@/api/client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type {
  Job,
  Application,
  CandidateApplicationDetail,
  Bookmark,
  Profile,
  ApplyData,
  CandidateSkills,
  ResumeUpload,
} from '@/features/candidate-portal/types';

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

type CandidateJobRow = Job & { jobPostingId?: string };
export type NormalizedCandidateJob = Job & { jobPostingId: string };

const normalizeJob = (job: CandidateJobRow): NormalizedCandidateJob => {
  const jobPostingId = job.jobPostingId ?? job.id;
  return {
    ...job,
    id: jobPostingId,
    jobPostingId,
  };
};

export const candidateApi = {
  getJobs: async (search?: string): Promise<NormalizedCandidateJob[]> => {
    const { data } = await apiClient.get('/candidate/jobs', { params: { search } });
    return unwrap(data as ApiEnvelope<CandidateJobRow[]>).map(normalizeJob);
  },

  getJobDetail: async (
    tenantId: string,
    jobId: string,
  ): Promise<NormalizedCandidateJob> => {
    const { data } = await apiClient.get(`/candidate/jobs/${tenantId}/${jobId}`);
    return normalizeJob(unwrap(data as ApiEnvelope<CandidateJobRow>));
  },

  getApplications: async (): Promise<Application[]> => {
    const { data } = await apiClient.get('/candidate/applications');
    return unwrap(data as ApiEnvelope<Application[]>);
  },

  getApplication: async (applicationId: string): Promise<CandidateApplicationDetail> => {
    const { data } = await apiClient.get(`/candidate/applications/${applicationId}`);
    return unwrap(data as ApiEnvelope<CandidateApplicationDetail>);
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

  updateProfile: async (
    profile: Omit<Profile, 'id' | 'skills' | 'resumeFileUrl' | 'resumeUploadedAt' | 'createdAt'>,
  ): Promise<ApiEnvelope<Profile>> => {
    const { data } = await apiClient.put('/candidate/profile', profile);
    return data as ApiEnvelope<Profile>;
  },

  uploadResume: async (file: File): Promise<ApiEnvelope<ResumeUpload>> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post('/candidate/resume', formData, {
      headers: { 'Content-Type': undefined },
    });
    return data as ApiEnvelope<ResumeUpload>;
  },

  removeResume: async (): Promise<void> => {
    await apiClient.delete('/candidate/resume');
  },
};
