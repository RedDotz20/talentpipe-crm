import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  companyId: string | null;
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
  companyId: localStorage.getItem('companyId'),
  role: localStorage.getItem('role'),

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    localStorage.setItem('userId', payload.sub);
    if (payload.companyId) {
      localStorage.setItem('companyId', payload.companyId);
    } else {
      localStorage.removeItem('companyId');
    }
    localStorage.setItem('role', payload.role);
    set({
      accessToken,
      refreshToken,
      userId: payload.sub,
      companyId: payload.companyId ?? null,
      role: payload.role,
    });
  },

  clearTokens: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('companyId');
    localStorage.removeItem('role');
    set({ accessToken: null, refreshToken: null, userId: null, companyId: null, role: null });
  },

  logout: () => {
    get().clearTokens();
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));