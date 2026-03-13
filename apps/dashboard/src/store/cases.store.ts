import { create } from 'zustand';
import { api } from '../lib/api';
import type { Case, CaseStatus, CasePriority, CaseListResponse } from '../types/case.types';
import { getStoredToken } from '../lib/auth';

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

function getMerchantIdFromToken(): string {
  const token = getStoredToken();
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.merchant_id || payload.merchantId || payload.sub || '';
  } catch {
    return '';
  }
}

export const useCasesStore = create<CasesState>((set, get) => ({
  cases: [],
  total: 0,
  page: 1,
  filters: { status: 'OPEN' },
  selectedIds: [],
  loading: false,

  fetchCases: async () => {
    set({ loading: true });
    try {
      const { page, filters } = get();
      const merchantId = getMerchantIdFromToken();
      const params = new URLSearchParams();
      if (merchantId) params.set('merchantId', merchantId);
      params.set('page', String(page));
      params.set('limit', '20');
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.search) params.set('search', filters.search);

      const response = await api.get<CaseListResponse>(`/api/v1/cases?${params.toString()}`);
      set({ cases: response.cases ?? [], total: response.total ?? 0 });
    } catch {
      set({ cases: [], total: 0 });
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
    const merchantId = getMerchantIdFromToken();
    const qs = merchantId ? `?merchantId=${merchantId}` : '';
    await api.patch(`/api/v1/cases/${id}${qs}`, {
      status: 'RESOLVED',
      resolution,
      resolutionNotes: notes,
    });
    set((state) => ({
      cases: state.cases.filter((c) => c.id !== id),
      total: Math.max(0, state.total - 1),
    }));
  },

  escalateCase: async (id) => {
    const merchantId = getMerchantIdFromToken();
    const qs = merchantId ? `?merchantId=${merchantId}` : '';
    await api.patch(`/api/v1/cases/${id}${qs}`, { status: 'ESCALATED' });
    set((state) => ({
      cases: state.cases.filter((c) => c.id !== id),
      total: Math.max(0, state.total - 1),
    }));
  },

  bulkResolve: async (resolution) => {
    const { selectedIds } = get();
    const merchantId = getMerchantIdFromToken();
    const qs = merchantId ? `?merchantId=${merchantId}` : '';
    await Promise.all(
      selectedIds.map((id) =>
        api.patch(`/api/v1/cases/${id}${qs}`, {
          status: 'RESOLVED',
          resolution,
          resolutionNotes: '',
        }),
      ),
    );
    set((state) => ({
      cases: state.cases.filter((c) => !state.selectedIds.includes(c.id)),
      total: Math.max(0, state.total - selectedIds.length),
      selectedIds: [],
    }));
  },
}));
