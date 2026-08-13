export const INTERNAL_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export type Permission =
  | 'jobs.view'
  | 'jobs.create_edit'
  | 'jobs.publish_close'
  | 'jobs.delete'
  | 'candidates.view'
  | 'candidates.manage'
  | 'applications.view'
  | 'applications.move'
  | 'applications.note'
  | 'interviews.view'
  | 'interviews.schedule'
  | 'interviews.feedback'
  | 'stages.manage'
  | 'settings.manage'
  | 'users.manage'
  | 'permissions.manage'
  | 'dashboard.view';

export const ALL_PERMISSIONS: Permission[] = [
  'jobs.view',
  'jobs.create_edit',
  'jobs.publish_close',
  'jobs.delete',
  'candidates.view',
  'candidates.manage',
  'applications.view',
  'applications.move',
  'applications.note',
  'interviews.view',
  'interviews.schedule',
  'interviews.feedback',
  'stages.manage',
  'settings.manage',
  'users.manage',
  'permissions.manage',
  'dashboard.view',
];

export const ROLE_PERMISSIONS: Record<InternalRole, Permission[]> = {
  CompanyAdmin: [
    'jobs.view',
    'jobs.create_edit',
    'jobs.publish_close',
    'jobs.delete',
    'candidates.view',
    'candidates.manage',
    'applications.view',
    'applications.move',
    'applications.note',
    'interviews.view',
    'interviews.schedule',
    'stages.manage',
    'settings.manage',
    'users.manage',
    'permissions.manage',
    'dashboard.view',
  ],
  Recruiter: [
    'jobs.view',
    'jobs.create_edit',
    'jobs.publish_close',
    'candidates.view',
    'candidates.manage',
    'applications.view',
    'applications.move',
    'applications.note',
    'interviews.view',
    'interviews.schedule',
    'dashboard.view',
  ],
  HiringManager: [
    'jobs.view',
    'candidates.view',
    'applications.view',
    'applications.move',
    'applications.note',
    'interviews.view',
    'interviews.schedule',
    'dashboard.view',
  ],
  Interviewer: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
};

export function isInternalRole(role: string): role is InternalRole {
  return (INTERNAL_ROLES as readonly string[]).includes(role);
}

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function defaultPresetFor(role: InternalRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function permissionsSubsetOfRole(
  role: InternalRole,
  permissions: string[],
): permissions is Permission[] {
  return permissions.every((p) =>
    ROLE_PERMISSIONS[role].includes(p as Permission),
  );
}
