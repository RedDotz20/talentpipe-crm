import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  companyId: string | null;
  role: string | null;
  permissions: string[];
  profile: AuthProfile | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setProfile: (profile: AuthProfile) => void;
  clearTokens: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export interface AuthProfile {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  userId: localStorage.getItem('userId'),
  companyId: localStorage.getItem('companyId'),
  role: localStorage.getItem('role'),
  permissions: JSON.parse(localStorage.getItem('permissions') ?? '[]'),
  profile: null,

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
    const permissions: string[] = payload.permissions ?? [];
    localStorage.setItem('permissions', JSON.stringify(permissions));
    set({
      accessToken,
      refreshToken,
      userId: payload.sub,
      companyId: payload.companyId ?? null,
      role: payload.role,
      permissions,
    });
  },

  setProfile: (profile) => set({ profile }),

  clearTokens: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('companyId');
    localStorage.removeItem('role');
    localStorage.removeItem('permissions');
    set({ accessToken: null, refreshToken: null, userId: null, companyId: null, role: null, permissions: [], profile: null });
  },

  logout: () => {
    get().clearTokens();
  },

  isAuthenticated: () => {
    return get().accessToken !== null;
  },
}));