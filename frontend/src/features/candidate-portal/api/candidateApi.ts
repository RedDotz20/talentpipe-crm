import { apiClient } from '../../../api/client';
import type { Job, Application, Bookmark, Profile, ApplyData } from '../types';

export const candidateApi = {
  getJobs: async (search?: string): Promise<Job[]> => {
    const { data } = await apiClient.get('/candidate/jobs', { params: { search } });
    return data;
  },

  getJobDetail: async (tenantId: string, jobId: string): Promise<Job> => {
    const { data } = await apiClient.get(`/candidate/jobs/${tenantId}/${jobId}`);
    return data;
  },

  getApplications: async (): Promise<Application[]> => {
    const { data } = await apiClient.get('/candidate/applications');
    return data;
  },

  applyToJob: async (jobId: string, applicationData: ApplyData): Promise<Application> => {
    const { data } = await apiClient.post(`/candidate/jobs/${jobId}/apply`, applicationData);
    return data;
  },

  getBookmarks: async (): Promise<Bookmark[]> => {
    const { data } = await apiClient.get('/candidate/bookmarks');
    return data;
  },

  addBookmark: async (tenantId: string, jobPostingId: string): Promise<Bookmark> => {
    const { data } = await apiClient.post('/candidate/bookmarks', { tenantId, jobPostingId });
    return data;
  },

  removeBookmark: async (bookmarkId: string): Promise<void> => {
    await apiClient.delete(`/candidate/bookmarks/${bookmarkId}`);
  },

  getProfile: async (): Promise<Profile> => {
    const { data } = await apiClient.get('/candidate/profile');
    return data;
  },
};
