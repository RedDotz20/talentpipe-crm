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
} as const;

export type QueryKeys = typeof queryKeys;