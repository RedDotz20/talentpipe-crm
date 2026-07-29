import { apiClient } from './client';

export interface Job {
  id: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
  description?: string;
  requirements?: string;
  benefits?: string;
}

export interface Application {
  id: string;
  jobTitle: string;
  companyName: string;
  status: string;
  appliedAt: string;
}

export interface Bookmark {
  id: string;
  jobListingId: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
}

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  createdAt: string;
}

export interface ApplyData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  coverLetter?: string;
  resumeUrl?: string;
}

export const candidateApi = {
  // Jobs
  getJobs: async (search?: string): Promise<Job[]> => {
    const { data } = await apiClient.get('/candidate/jobs', { params: { search } });
    return data;
  },

  getJobDetail: async (tenantId: string, jobId: string): Promise<Job> => {
    const { data } = await apiClient.get(`/candidate/jobs/${tenantId}/${jobId}`);
    return data;
  },

  // Applications
  getApplications: async (): Promise<Application[]> => {
    const { data } = await apiClient.get('/candidate/applications');
    return data;
  },

  applyToJob: async (jobId: string, applicationData: ApplyData): Promise<Application> => {
    const { data } = await apiClient.post(`/candidate/jobs/${jobId}/apply`, applicationData);
    return data;
  },

  // Bookmarks
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

  // Profile
  getProfile: async (): Promise<Profile> => {
    const { data } = await apiClient.get('/candidate/profile');
    return data;
  },
};