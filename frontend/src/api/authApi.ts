import { apiClient } from './client';

export const authApi = {
  signin: (email: string, password: string) =>
    apiClient.post('/auth/signin', { email, password }),

  candidateSignup: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => apiClient.post('/auth/signup', data),

  companySignup: (data: {
    companyName: string;
    slug: string;
    email: string;
    password: string;
  }) => apiClient.post('/auth/company/signup', data),

  logout: () => apiClient.post('/auth/logout'),

  refreshAuth: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),
};