export const queryKeys = {
  candidate: {
    jobs: (search?: string) => ['candidate', 'jobs', { search }],
    jobDetail: (tenantId: string, jobId: string) => ['candidate', 'jobs', tenantId, jobId],
    applications: () => ['candidate', 'applications'],
    bookmarks: () => ['candidate', 'bookmarks'],
    profile: () => ['candidate', 'profile'],
    skills: () => ['candidate', 'skills'],
  },
  auth: {
    me: () => ['auth', 'me'],
  },
  org: {
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
  },
} as const;

export type QueryKeys = typeof queryKeys;