import { create } from 'zustand';
import { authApi } from './authApi';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  signin: (email: string, password: string) => Promise<void>;
  candidateSignup: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  orgSignup: (data: {
    companyName: string;
    slug: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  userId: localStorage.getItem('userId'),
  tenantId: localStorage.getItem('tenantId'),
  role: localStorage.getItem('role'),

  signin: async (email, password) => {
    const { data } = await authApi.signin(email, password);
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('userId', payload.sub);
    if (payload.tenantId) {
      localStorage.setItem('tenantId', payload.tenantId);
    } else {
      localStorage.removeItem('tenantId');
    }
    localStorage.setItem('role', payload.role);
    set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: payload.sub,
      tenantId: payload.tenantId ?? null,
      role: payload.role,
    });
  },

  candidateSignup: async (data) => {
    const { data: res } = await authApi.candidateSignup(data);
    const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.removeItem('tenantId');
    localStorage.setItem('role', payload.role);
    set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      userId: payload.sub,
      tenantId: null,
      role: payload.role,
    });
  },
  orgSignup: async (data) => {
    const { data: res } = await authApi.orgSignup(data);
    const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.setItem('tenantId', payload.tenantId);
    localStorage.setItem('role', payload.role);
    set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    });
  },

  logout: async () => {
    const accessToken = get().accessToken;
    if (accessToken) {
      try {
        await authApi.logout();
      } catch {
        // best-effort server-side invalidation
      }
    }
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
    try {
      const { data } = await authApi.refreshAuth(refreshToken);
      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      set({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? refreshToken });
    } catch {
      get().logout();
    }
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));