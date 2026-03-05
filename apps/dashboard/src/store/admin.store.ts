import { create } from 'zustand';
import {
  fetchUsers as apiFetchUsers,
  inviteUser as apiInviteUser,
  deactivateUser as apiDeactivateUser,
  fetchServiceHealth as apiFetchServiceHealth,
  fetchRules as apiFetchRules,
  updateRuleWeight as apiUpdateRuleWeight,
  updateRuleExpression as apiUpdateRuleExpression,
} from '../api/admin.api';
import type { AdminState } from '../types/admin.types';

interface AdminStore extends AdminState {
  activeTab: 'users' | 'health' | 'rules';
  setActiveTab: (tab: 'users' | 'health' | 'rules') => void;
  fetchUsers: () => Promise<void>;
  inviteUser: (email: string, role: string) => Promise<void>;
  deactivateUser: (userId: string) => Promise<void>;
  fetchServiceHealth: () => Promise<void>;
  startHealthPolling: (intervalMs?: number) => () => void;
  fetchRules: () => Promise<void>;
  updateRuleWeight: (ruleId: string, weight: number) => Promise<void>;
  updateRuleExpression: (ruleId: string, expression: string) => Promise<void>;
}

export const useAdminStore = create<AdminStore>((set, get) => ({
  users: [],
  services: [],
  rules: [],
  isLoadingUsers: false,
  isLoadingServices: false,
  isLoadingRules: false,
  error: null,
  activeTab: 'users',

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  fetchUsers: async () => {
    set({ isLoadingUsers: true, error: null });
    try {
      const users = await apiFetchUsers();
      set({ users, isLoadingUsers: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      set({ error: message, isLoadingUsers: false });
    }
  },

  inviteUser: async (email, role) => {
    try {
      const newUser = await apiInviteUser(email, role);
      set((state) => ({ users: [...state.users, newUser] }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to invite user';
      set({ error: message });
      throw err;
    }
  },

  deactivateUser: async (userId) => {
    try {
      await apiDeactivateUser(userId);
      set((state) => ({
        users: state.users.map((u) =>
          u.id === userId ? { ...u, isActive: false } : u,
        ),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deactivate user';
      set({ error: message });
      throw err;
    }
  },

  fetchServiceHealth: async () => {
    set({ isLoadingServices: true, error: null });
    try {
      const services = await apiFetchServiceHealth();
      set({ services, isLoadingServices: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch service health';
      set({ error: message, isLoadingServices: false });
    }
  },

  startHealthPolling: (intervalMs = 30_000) => {
    get().fetchServiceHealth();
    const id = setInterval(() => {
      get().fetchServiceHealth();
    }, intervalMs);
    return () => clearInterval(id);
  },

  fetchRules: async () => {
    set({ isLoadingRules: true, error: null });
    try {
      const rules = await apiFetchRules();
      set({ rules, isLoadingRules: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch rules';
      set({ error: message, isLoadingRules: false });
    }
  },

  updateRuleWeight: async (ruleId, weight) => {
    try {
      const updatedRule = await apiUpdateRuleWeight(ruleId, weight);
      set((state) => ({
        rules: state.rules.map((r) => (r.id === ruleId ? updatedRule : r)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update rule weight';
      set({ error: message });
      throw err;
    }
  },

  updateRuleExpression: async (ruleId, expression) => {
    try {
      const updatedRule = await apiUpdateRuleExpression(ruleId, expression);
      set((state) => ({
        rules: state.rules.map((r) => (r.id === ruleId ? updatedRule : r)),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update rule expression';
      set({ error: message });
      throw err;
    }
  },
}));
