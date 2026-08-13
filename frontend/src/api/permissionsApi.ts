import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface PermissionGroupItem {
  key: string;
  label: string;
}

export interface PermissionGroup {
  label: string;
  items: PermissionGroupItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: 'Jobs',
    items: [
      { key: 'jobs.view', label: 'View job postings' },
      { key: 'jobs.create_edit', label: 'Create and edit job postings' },
      { key: 'jobs.publish_close', label: 'Publish and close job postings' },
      { key: 'jobs.delete', label: 'Delete job postings' },
    ],
  },
  {
    label: 'Candidates',
    items: [
      { key: 'candidates.view', label: 'View candidates' },
      { key: 'candidates.manage', label: 'Create and edit candidates' },
    ],
  },
  {
    label: 'Applications',
    items: [
      { key: 'applications.view', label: 'View applications' },
      { key: 'applications.move', label: 'Move applications between stages' },
      { key: 'applications.note', label: 'Add notes to applications' },
    ],
  },
  {
    label: 'Interviews',
    items: [
      { key: 'interviews.view', label: 'View interviews' },
      { key: 'interviews.schedule', label: 'Schedule and reschedule interviews' },
      { key: 'interviews.feedback', label: 'Submit interview feedback' },
    ],
  },
  {
    label: 'Pipeline stages',
    items: [{ key: 'stages.manage', label: 'Manage pipeline stages' }],
  },
  {
    label: 'Company settings',
    items: [{ key: 'settings.manage', label: 'Manage company settings' }],
  },
  {
    label: 'Team management',
    items: [{ key: 'users.manage', label: 'Manage team members' }],
  },
  {
    label: 'Permissions',
    items: [{ key: 'permissions.manage', label: 'Manage permission presets' }],
  },
  {
    label: 'Dashboard',
    items: [{ key: 'dashboard.view', label: 'View dashboard' }],
  },
];

const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i.label]),
);

export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key] ?? key;
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  CompanyAdmin: [
    'jobs.view', 'jobs.create_edit', 'jobs.publish_close', 'jobs.delete',
    'candidates.view', 'candidates.manage',
    'applications.view', 'applications.move', 'applications.note',
    'interviews.view', 'interviews.schedule',
    'stages.manage', 'settings.manage', 'users.manage', 'permissions.manage',
    'dashboard.view',
  ],
  Recruiter: [
    'jobs.view', 'jobs.create_edit', 'jobs.publish_close',
    'candidates.view', 'candidates.manage',
    'applications.view', 'applications.move', 'applications.note',
    'interviews.view', 'interviews.schedule',
    'dashboard.view',
  ],
  HiringManager: [
    'jobs.view', 'candidates.view',
    'applications.view', 'applications.move', 'applications.note',
    'interviews.view', 'interviews.schedule',
    'dashboard.view',
  ],
  Interviewer: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
};

export interface PermissionPreset {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
  isGlobal?: boolean;
  usageCount: number;
  isEnabled: boolean;
}

export interface PermissionPresetsResponse {
  presets: PermissionPreset[];
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const companyPermissionsApi = {
  list: async (): Promise<PermissionPresetsResponse> => {
    const { data } = await apiClient.get('/company/permissions');
    return unwrap(data as ApiEnvelope<PermissionPresetsResponse>);
  },
  create: async (body: { name: string; role: string; permissions: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.post('/company/permissions', body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  update: async (id: string, body: { name?: string; permissions?: string[] }): Promise<ApiEnvelope<PermissionPreset>> => {
    const { data } = await apiClient.patch(`/company/permissions/${id}`, body);
    return data as ApiEnvelope<PermissionPreset>;
  },
  remove: async (id: string): Promise<ApiEnvelope<{ id: string }>> => {
    const { data } = await apiClient.delete(`/company/permissions/${id}`);
    return data as ApiEnvelope<{ id: string }>;
  },
  removeMany: async (
    ids: string[],
  ): Promise<ApiEnvelope<{ deleted: number; revertedUsers: number }>> => {
    const { data } = await apiClient.post('/company/permissions/bulk-delete', { ids });
    return data as ApiEnvelope<{ deleted: number; revertedUsers: number }>;
  },
  setEnabled: async (
    id: string,
    enabled: boolean,
  ): Promise<ApiEnvelope<{ id: string; revertedUsers: number }>> => {
    const { data } = await apiClient.patch(`/company/permissions/${id}/${enabled ? 'enable' : 'disable'}`);
    return data as ApiEnvelope<{ id: string; revertedUsers: number }>;
  },
  bulkSetEnabled: async (
    ids: string[],
    enabled: boolean,
  ): Promise<ApiEnvelope<{ updated: number; revertedUsers: number }>> => {
    const { data } = await apiClient.post('/company/permissions/bulk-status', { ids, enabled });
    return data as ApiEnvelope<{ updated: number; revertedUsers: number }>;
  },
};
