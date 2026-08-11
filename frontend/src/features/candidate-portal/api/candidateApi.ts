import { apiClient } from '@/api/client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';
import type {
  Job,
  Application,
  CandidateApplicationDetail,
  Bookmark,
  Profile,
  ApplyData,
  ResumeUpload,
  Skill,
} from '@/features/candidate-portal/types';
import type {
  ListQueryParams,
  Paginated,
} from '@/shared/types/listQuery';

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
  getJobs: async (
    params?: ListQueryParams & { employmentType?: string; workSetup?: string },
  ): Promise<Paginated<NormalizedCandidateJob>> => {
    const { data } = await apiClient.get('/candidate/jobs', { params });
    const body = unwrap(data as ApiEnvelope<Paginated<CandidateJobRow>>);
    return { ...body, data: body.data.map(normalizeJob) };
  },

  getJobDetail: async (
    companyId: string,
    jobId: string,
  ): Promise<NormalizedCandidateJob> => {
    const { data } = await apiClient.get(`/candidate/jobs/${companyId}/${jobId}`);
    return normalizeJob(unwrap(data as ApiEnvelope<CandidateJobRow>));
  },

  getApplications: async (
    params?: ListQueryParams & { status?: string },
  ): Promise<Paginated<Application>> => {
    const { data } = await apiClient.get('/candidate/applications', { params });
    return unwrap(data as ApiEnvelope<Paginated<Application>>);
  },

  getApplication: async (applicationId: string): Promise<CandidateApplicationDetail> => {
    const { data } = await apiClient.get(`/candidate/applications/${applicationId}`);
    return unwrap(data as ApiEnvelope<CandidateApplicationDetail>);
  },

  withdrawApplication: async (applicationId: string): Promise<void> => {
    await apiClient.delete(`/candidate/applications/${applicationId}`);
  },

  applyToJob: async (companyId: string, jobId: string, applicationData: ApplyData): Promise<{ applicationId: string }> => {
    const { data } = await apiClient.post(`/candidate/jobs/${companyId}/${jobId}/apply`, applicationData);
    return unwrap(data as ApiEnvelope<{ applicationId: string }>);
  },

  getBookmarks: async (params?: ListQueryParams): Promise<Paginated<Bookmark>> => {
    const { data } = await apiClient.get('/candidate/bookmarks', { params });
    return unwrap(data as ApiEnvelope<Paginated<Bookmark>>);
  },

  addBookmark: async (companyId: string, jobPostingId: string): Promise<Bookmark> => {
    const { data } = await apiClient.post('/candidate/bookmarks', { companyId, jobPostingId });
    return unwrap(data as ApiEnvelope<Bookmark>);
  },

  removeBookmark: async (bookmarkId: string): Promise<void> => {
    await apiClient.delete(`/candidate/bookmarks/${bookmarkId}`);
  },

  getProfile: async (): Promise<Profile> => {
    const { data } = await apiClient.get('/candidate/profile');
    return unwrap(data as ApiEnvelope<Profile>);
  },

  getSkills: async (): Promise<Skill[]> => {
    const { data } = await apiClient.get('/candidate/skills');
    return unwrap(data as ApiEnvelope<Skill[]>);
  },

  setSkills: async (skillIds: string[]): Promise<{ skills: number }> => {
    const { data } = await apiClient.put('/candidate/skills', { skillIds });
    return unwrap(data as ApiEnvelope<{ skills: number }>);
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
