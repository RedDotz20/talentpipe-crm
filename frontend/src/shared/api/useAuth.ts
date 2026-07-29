import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearTokens: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  userId: localStorage.getItem('userId'),
  tenantId: localStorage.getItem('tenantId'),
  role: localStorage.getItem('role'),

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    localStorage.setItem('userId', payload.sub);
    if (payload.tenantId) {
      localStorage.setItem('tenantId', payload.tenantId);
    } else {
      localStorage.removeItem('tenantId');
    }
    localStorage.setItem('role', payload.role);
    set({
      accessToken,
      refreshToken,
      userId: payload.sub,
      tenantId: payload.tenantId ?? null,
      role: payload.role,
    });
  },

  clearTokens: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('role');
    set({ accessToken: null, refreshToken: null, userId: null, tenantId: null, role: null });
  },

  logout: () => {
    get().clearTokens();
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));