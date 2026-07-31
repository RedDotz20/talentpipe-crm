export const queryKeys = {
  candidate: {
    jobs: (search?: string) => ['candidate', 'jobs', { search }],
    jobDetail: (tenantId: string, jobId: string) => ['candidate', 'jobs', tenantId, jobId],
    applications: () => ['candidate', 'applications'],
    bookmarks: () => ['candidate', 'bookmarks'],
    profile: () => ['candidate', 'profile'],
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
  },
} as const;

export type QueryKeys = typeof queryKeys;