import axios from 'axios';
import { useAuthStore } from './useAuth';

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

// Response interceptor to handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { accessToken, logout } = useAuthStore.getState();
      if (accessToken) {
        logout();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/signin';
        }
      }
    }
    return Promise.reject(error);
  },
);
