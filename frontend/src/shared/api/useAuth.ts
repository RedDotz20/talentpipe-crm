import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { companyName: string; slug: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  isAuthenticated: () => boolean;
}

const API = 'http://localhost:3000/api';

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  userId: localStorage.getItem('userId'),
  tenantId: localStorage.getItem('tenantId'),
  role: localStorage.getItem('role'),

  login: async (email, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.setItem('tenantId', payload.tenantId);
    localStorage.setItem('role', payload.role);
    set({ accessToken: data.accessToken, refreshToken: data.refreshToken, userId: payload.sub, tenantId: payload.tenantId, role: payload.role });
  },

  signup: async (data) => {
    const res = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Signup failed');
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('role');
    set({ accessToken: null, refreshToken: null, userId: null, tenantId: null, role: null });
  },

  refreshAuth: async () => {
    const refreshToken = get().refreshToken;
    if (!refreshToken) return;
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      get().logout();
      return;
    }
    const data = await res.json();
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    set({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? refreshToken });
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));
