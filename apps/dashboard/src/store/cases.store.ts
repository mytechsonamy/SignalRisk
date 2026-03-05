import { create } from 'zustand';
import { api } from '../lib/api';
import type { Case, CaseStatus, CasePriority, CaseListResponse } from '../types/case.types';

interface CasesFilters {
  status?: CaseStatus;
  priority?: CasePriority;
  search?: string;
}

interface CasesState {
  cases: Case[];
  total: number;
  page: number;
  filters: CasesFilters;
  selectedIds: string[];
  loading: boolean;

  fetchCases: () => Promise<void>;
  setFilter: (key: string, value: string | undefined) => void;
  setPage: (page: number) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  resolveCase: (id: string, resolution: string, notes: string) => Promise<void>;
  escalateCase: (id: string) => Promise<void>;
  bulkResolve: (resolution: string) => Promise<void>;
}

export const useCasesStore = create<CasesState>((set, get) => ({
  cases: [],
  total: 0,
  page: 1,
  filters: {},
  selectedIds: [],
  loading: false,

  fetchCases: async () => {
    set({ loading: true });
    try {
      const { page, filters } = get();
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.search) params.set('search', filters.search);

      const response = await api.get<CaseListResponse>(`/v1/cases?${params.toString()}`);
      set({ cases: response.cases, total: response.total });
    } finally {
      set({ loading: false });
    }
  },

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
      page: 1,
    }));
    get().fetchCases();
  },

  setPage: (page) => {
    set({ page });
    get().fetchCases();
  },

  toggleSelect: (id) => {
    set((state) => {
      const isSelected = state.selectedIds.includes(id);
      return {
        selectedIds: isSelected
          ? state.selectedIds.filter((sid) => sid !== id)
          : [...state.selectedIds, id],
      };
    });
  },

  selectAll: () => {
    set((state) => ({ selectedIds: state.cases.map((c) => c.id) }));
  },

  clearSelection: () => {
    set({ selectedIds: [] });
  },

  resolveCase: async (id, resolution, notes) => {
    await api.put(`/v1/cases/${id}/resolve`, { resolution, notes });
    set((state) => ({
      cases: state.cases.map((c) =>
        c.id === id
          ? { ...c, status: 'RESOLVED' as CaseStatus, resolution, resolutionNotes: notes, resolvedAt: new Date().toISOString() }
          : c,
      ),
    }));
  },

  escalateCase: async (id) => {
    await api.put(`/v1/cases/${id}/escalate`, {});
    set((state) => ({
      cases: state.cases.map((c) =>
        c.id === id ? { ...c, status: 'ESCALATED' as CaseStatus } : c,
      ),
    }));
  },

  bulkResolve: async (resolution) => {
    const { selectedIds } = get();
    await Promise.all(
      selectedIds.map((id) => api.put(`/v1/cases/${id}/resolve`, { resolution, notes: '' })),
    );
    set((state) => ({
      cases: state.cases.map((c) =>
        state.selectedIds.includes(c.id)
          ? { ...c, status: 'RESOLVED' as CaseStatus, resolution, resolvedAt: new Date().toISOString() }
          : c,
      ),
      selectedIds: [],
    }));
  },
}));
