import { create } from 'zustand';
import { api } from '../lib/api';
import {
  clearAuth,
  getStoredToken,
  getStoredUser,
  setStoredToken,
  setStoredUser,
  type StoredUser,
} from '../lib/auth';

interface LoginResponse {
  accessToken: string;
  user: StoredUser;
}

interface AuthState {
  user: StoredUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  initFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  initFromStorage: () => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (token && user) {
      set({ user, isAuthenticated: true });
    }
  },

  login: async (email: string, password: string) => {
    const response = await api.post<LoginResponse>('/v1/auth/login', {
      email,
      password,
    });
    setStoredToken(response.accessToken);
    setStoredUser(response.user);
    set({ user: response.user, isAuthenticated: true });
  },

  logout: () => {
    clearAuth();
    set({ user: null, isAuthenticated: false });
    window.location.href = '/login';
  },
}));
