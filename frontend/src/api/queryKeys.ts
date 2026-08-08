export const queryKeys = {
  skills: {
    all: () => ['skills', 'all'],
  },
  candidate: {
    jobs: (search?: string) => ['candidate', 'jobs', { search }],
    jobDetail: (companyId: string, jobId: string) => ['candidate', 'jobs', companyId, jobId],
    applications: () => ['candidate', 'applications'],
    application: (applicationId: string) => ['candidate', 'applications', applicationId],
    bookmarks: () => ['candidate', 'bookmarks'],
    profile: () => ['candidate', 'profile'],
    skills: () => ['candidate', 'skills'],
  },
  publicCareers: {
    jobs: (companySlug: string) => ['public-careers', 'jobs', companySlug],
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
    jobPostings: (status?: string) => ['company', 'job-postings', { status }],
    jobPosting: (id: string) => ['company', 'job-postings', id],
    candidates: () => ['company', 'candidates'],
    candidate: (id: string) => ['company', 'candidates', id],
    skills: (search?: string) => ['company', 'skills', { search }],
    applications: (filters?: { jobPostingId?: string; stageId?: string }) => [
      'company',
      'applications',
      filters,
    ],
    application: (id: string) => ['company', 'applications', id],
    notes: (applicationId: string) => ['company', 'applications', applicationId, 'notes'],
    pipelineStages: () => ['company', 'pipeline-stages'],
    resume: (candidateId: string) => ['company', 'candidates', candidateId, 'resume'],
    interviews: () => ['company', 'interviews'],
    interview: (id: string) => ['company', 'interviews', id],
    companyUsers: () => ['company', 'users'],
    companySettings: () => ['company', 'settings'],
  },
  platform: {
    companies: () => ['platform', 'companies'],
    company: (id: string) => ['platform', 'companies', id],
    companyUsers: (companyId: string) => ['platform', 'companies', companyId, 'users'],
    companyStages: (companyId: string) => ['platform', 'companies', companyId, 'stages'],
    candidates: () => ['platform', 'candidates'],
    applications: (filters?: { companyId?: string; status?: string }) => [
      'platform',
      'applications',
      filters,
    ],
    interviews: (filters?: { companyId?: string; status?: string }) => [
      'platform',
      'interviews',
      filters,
    ],
    stats: () => ['platform', 'stats'],
    users: () => ['platform', 'users'],
  },
} as const;

export type QueryKeys = typeof queryKeys;
