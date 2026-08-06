import { apiClient } from './client';
import type { ApiEnvelope } from '@/hooks/useApiMutation';

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface TenantDetail extends PlatformTenant {
  users: number;
  applications: number;
}

export interface PlatformStats {
  tenants: number;
  users: number;
  applications: number;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

export const platformApi = {
  listTenants: async (): Promise<PlatformTenant[]> => {
    const { data } = await apiClient.get('/platform/tenants');
    return unwrap(data as ApiEnvelope<PlatformTenant[]>);
  },
  getTenant: async (id: string): Promise<TenantDetail> => {
    const { data } = await apiClient.get(`/platform/tenants/${id}`);
    return unwrap(data as ApiEnvelope<TenantDetail>);
  },
  setStatus: async (
    id: string,
    status: 'active' | 'suspended',
  ): Promise<ApiEnvelope<PlatformTenant>> => {
    const { data } = await apiClient.patch(
      `/platform/tenants/${id}/${status === 'suspended' ? 'suspend' : 'reactivate'}`,
    );
    return data as ApiEnvelope<PlatformTenant>;
  },
  getStats: async (): Promise<PlatformStats> => {
    const { data } = await apiClient.get('/platform/stats');
    return unwrap(data as ApiEnvelope<PlatformStats>);
  },
};
