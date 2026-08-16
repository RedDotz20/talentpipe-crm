import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './useAuth';
import { queryClient } from './queryClient';
import { router } from '@/app/router';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await apiClient.post('/auth/refresh', { refreshToken });
  const { accessToken, refreshToken: newRefreshToken } = data.data;
  useAuthStore
    .getState()
    .setTokens(accessToken, newRefreshToken ?? refreshToken);
  return accessToken;
}

function forceLogout() {
  useAuthStore.getState().logout();
  queryClient.clear();
  router.navigate({ to: '/auth/signin' });
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// Response interceptor: refresh once on 401, then retry; logout as last resort
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url: string = error.config?.url ?? '';
    const isAuthRoute =
      url.includes('/auth/signin') || url.includes('/auth/refresh');
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401 && !isAuthRoute && config && !config._retried) {
      // Already logged out (e.g. mid-logout refetches) — no token to refresh or
      // session to force-logout. Reject and let the in-flight navigation win.
      if (!useAuthStore.getState().accessToken) {
        return Promise.reject(error);
      }
      config._retried = true;
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const newToken = await refreshPromise;
        config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(config);
      } catch {
        forceLogout();
      }
    } else if (error.response?.status === 401 && url.includes('/auth/refresh')) {
      if (useAuthStore.getState().accessToken) {
        forceLogout();
      }
    }
    return Promise.reject(error);
  },
);
