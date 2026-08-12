import type { ListQueryParams } from '@/shared/types/listQuery';

export interface CompanyJobPostingsParams extends ListQueryParams {
  status?: string;
}

export interface CompanyInterviewsParams extends ListQueryParams {
  status?: string;
}

export interface PlatformAppsJobsParams extends ListQueryParams {
  companyId?: string;
  status?: string;
}

export interface PlatformUsersParams extends ListQueryParams {
  type?: string;
  companyId?: string;
  role?: string;
}

export interface PlatformCompaniesParams extends ListQueryParams {
  status?: string;
}

export interface CandidateJobsParams extends ListQueryParams {
  employmentType?: string;
  workSetup?: string;
}

export const queryKeys = {
  skills: {
    all: () => ['skills', 'all'],
  },
  candidate: {
    jobs: (params?: CandidateJobsParams) => ['candidate', 'jobs', params],
    jobDetail: (companyId: string, jobId: string) => ['candidate', 'jobs', companyId, jobId],
    applications: (params?: ListQueryParams & { status?: string }) => ['candidate', 'applications', params],
    application: (applicationId: string) => ['candidate', 'applications', applicationId],
    bookmarks: (params?: ListQueryParams) => ['candidate', 'bookmarks', params],
    profile: () => ['candidate', 'profile'],
    skills: () => ['candidate', 'skills'],
  },
  publicCareers: {
    jobs: (companySlug: string, params?: ListQueryParams) => ['public-careers', 'jobs', companySlug, params],
    job: (companySlug: string, jobId: string) => [
      'public-careers',
      'jobs',
      companySlug,
      jobId,
    ],
  },
  auth: {
    me: () => ['auth', 'me'],
  },
  company: {
    dashboardSummary: () => ['company', 'dashboard', 'summary'],
    jobPostings: (params?: CompanyJobPostingsParams) => ['company', 'job-postings', params],
    jobPosting: (id: string) => ['company', 'job-postings', id],
    candidates: (params?: ListQueryParams) => ['company', 'candidates', params],
    candidate: (id: string) => ['company', 'candidates', id],
    skills: (search?: string) => ['company', 'skills', { search }],
    applications: (filters?: { jobPostingId?: string; stageId?: string; search?: string; sortBy?: string; sortDir?: 'asc' | 'desc' }) => [
      'company',
      'applications',
      filters,
    ],
    application: (id: string) => ['company', 'applications', id],
    notes: (applicationId: string) => ['company', 'applications', applicationId, 'notes'],
    pipelineStages: () => ['company', 'pipeline-stages'],
    resume: (candidateId: string) => ['company', 'candidates', candidateId, 'resume'],
    interviews: (params?: CompanyInterviewsParams) => ['company', 'interviews', params],
    interview: (id: string) => ['company', 'interviews', id],
    companyUsers: () => ['company', 'users'],
    companySettings: () => ['company', 'settings'],
  },
  platform: {
    companies: (params?: PlatformCompaniesParams) => ['platform', 'companies', params],
    company: (id: string) => ['platform', 'companies', id],
    companyUsers: (companyId: string) => ['platform', 'companies', companyId, 'users'],
    companyStages: (companyId: string) => ['platform', 'companies', companyId, 'stages'],
    candidates: () => ['platform', 'candidates'],
    applications: (params?: PlatformAppsJobsParams) => [
      'platform',
      'applications',
      params,
    ],
    interviews: (params?: PlatformAppsJobsParams) => [
      'platform',
      'interviews',
      params,
    ],
    jobs: (params?: PlatformAppsJobsParams) => [
      'platform',
      'jobs',
      params,
    ],
    stats: () => ['platform', 'stats'],
    dashboard: () => ['platform', 'dashboard'],
    users: (params?: PlatformUsersParams) => ['platform', 'users', params],
  },
} as const;

export type QueryKeys = typeof queryKeys;
