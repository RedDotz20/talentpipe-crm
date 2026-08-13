import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export const PERMISSION_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Jobs', keys: ['jobs.view', 'jobs.create_edit', 'jobs.publish_close', 'jobs.delete'] },
  { label: 'Candidates', keys: ['candidates.view', 'candidates.manage'] },
  { label: 'Applications', keys: ['applications.view', 'applications.move', 'applications.note'] },
  { label: 'Interviews', keys: ['interviews.view', 'interviews.schedule', 'interviews.feedback'] },
  { label: 'Pipeline stages', keys: ['stages.manage'] },
  { label: 'Company settings', keys: ['settings.manage'] },
  { label: 'Team management', keys: ['users.manage'] },
  { label: 'Permissions', keys: ['permissions.manage'] },
  { label: 'Dashboard', keys: ['dashboard.view'] },
];

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
};
