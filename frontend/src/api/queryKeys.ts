export const queryKeys = {
  skills: {
    all: () => ['skills', 'all'],
  },
  candidate: {
    jobs: (search?: string) => ['candidate', 'jobs', { search }],
    jobDetail: (tenantId: string, jobId: string) => ['candidate', 'jobs', tenantId, jobId],
    applications: () => ['candidate', 'applications'],
    application: (applicationId: string) => ['candidate', 'applications', applicationId],
    bookmarks: () => ['candidate', 'bookmarks'],
    profile: () => ['candidate', 'profile'],
    skills: () => ['candidate', 'skills'],
  },
  publicCareers: {
    jobs: (tenantSlug: string) => ['public-careers', 'jobs', tenantSlug],
    job: (tenantSlug: string, jobId: string) => [
      'public-careers',
      'jobs',
      tenantSlug,
      jobId,
    ],
  },
  auth: {
    me: () => ['auth', 'me'],
  },
  org: {
    dashboardSummary: () => ['org', 'dashboard', 'summary'],
    jobPostings: (status?: string) => ['org', 'job-postings', { status }],
    jobPosting: (id: string) => ['org', 'job-postings', id],
    candidates: () => ['org', 'candidates'],
    candidate: (id: string) => ['org', 'candidates', id],
    skills: (search?: string) => ['org', 'skills', { search }],
    applications: (filters?: { jobPostingId?: string; stageId?: string }) => [
      'org',
      'applications',
      filters,
    ],
    application: (id: string) => ['org', 'applications', id],
    notes: (applicationId: string) => ['org', 'applications', applicationId, 'notes'],
    pipelineStages: () => ['org', 'pipeline-stages'],
    resume: (candidateId: string) => ['org', 'candidates', candidateId, 'resume'],
    interviews: () => ['org', 'interviews'],
    interview: (id: string) => ['org', 'interviews', id],
    orgUsers: () => ['org', 'users'],
    orgSettings: () => ['org', 'settings'],
  },
  platform: {
    tenants: () => ['platform', 'tenants'],
    tenant: (id: string) => ['platform', 'tenants', id],
    tenantUsers: (tenantId: string) => ['platform', 'tenants', tenantId, 'users'],
    tenantStages: (tenantId: string) => ['platform', 'tenants', tenantId, 'stages'],
    candidates: () => ['platform', 'candidates'],
    applications: (filters?: { tenantId?: string; status?: string }) => [
      'platform',
      'applications',
      filters,
    ],
    interviews: (filters?: { tenantId?: string; status?: string }) => [
      'platform',
      'interviews',
      filters,
    ],
    stats: () => ['platform', 'stats'],
  },
} as const;

export type QueryKeys = typeof queryKeys;
