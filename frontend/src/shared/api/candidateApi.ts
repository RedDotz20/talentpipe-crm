import { apiClient } from './client';

export const candidateApi = {
  // Jobs
  getJobs: async () => {
    const { data } = await apiClient.get('/candidate/jobs');
    return data;
  },

  // Applications
  getApplications: async () => {
    const { data } = await apiClient.get('/candidate/applications');
    return data;
  },

  applyToJob: async (jobId: string, applicationData: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    coverLetter?: string;
    resumeUrl?: string;
  }) => {
    const { data } = await apiClient.post(`/candidate/jobs/${jobId}/apply`, applicationData);
    return data;
  },

  // Bookmarks
  getBookmarks: async () => {
    const { data } = await apiClient.get('/candidate/bookmarks');
    return data;
  },

  removeBookmark: async (jobListingId: string) => {
    const { data } = await apiClient.delete(`/candidate/bookmarks/${jobListingId}`);
    return data;
  },

  // Profile
  getProfile: async () => {
    const { data } = await apiClient.get('/candidate/profile');
    return data;
  },
};