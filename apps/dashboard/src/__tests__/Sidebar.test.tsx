import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import { useAuthStore } from '../store/auth.store';

vi.mock('../store/auth.store');

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('admin user', () => {
    beforeEach(() => {
      vi.mocked(useAuthStore).mockReturnValue({
        isAuthenticated: true,
        user: { id: '1', email: 'admin@test.com', role: 'admin' },
        login: vi.fn(),
        logout: vi.fn(),
        initFromStorage: vi.fn(),
      });
    });

    it('shows Overview nav item', () => {
      renderSidebar();
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    it('shows Cases nav item', () => {
      renderSidebar();
      expect(screen.getByText('Cases')).toBeInTheDocument();
    });

    it('shows Rules nav item', () => {
      renderSidebar();
      expect(screen.getByText('Rules')).toBeInTheDocument();
    });

    it('shows Settings nav item', () => {
      renderSidebar();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  describe('analyst user', () => {
    beforeEach(() => {
      vi.mocked(useAuthStore).mockReturnValue({
        isAuthenticated: true,
        user: { id: '2', email: 'analyst@test.com', role: 'analyst' },
        login: vi.fn(),
        logout: vi.fn(),
        initFromStorage: vi.fn(),
      });
    });

    it('shows Overview nav item', () => {
      renderSidebar();
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });

    it('shows Cases nav item', () => {
      renderSidebar();
      expect(screen.getByText('Cases')).toBeInTheDocument();
    });

    it('does not show Rules nav item', () => {
      renderSidebar();
      expect(screen.queryByText('Rules')).not.toBeInTheDocument();
    });

    it('does not show Settings nav item', () => {
      renderSidebar();
      expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });
  });

  describe('active route', () => {
    it('highlights Overview when on / path', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        isAuthenticated: true,
        user: { id: '1', email: 'admin@test.com', role: 'admin' },
        login: vi.fn(),
        logout: vi.fn(),
        initFromStorage: vi.fn(),
      });

      renderSidebar('/');
      const overviewLink = screen.getByText('Overview').closest('a');
      expect(overviewLink).toHaveClass('bg-surface-sidebar-active');
      expect(overviewLink).toHaveClass('font-bold');
    });

    it('does not highlight Overview when on /cases path', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        isAuthenticated: true,
        user: { id: '1', email: 'admin@test.com', role: 'admin' },
        login: vi.fn(),
        logout: vi.fn(),
        initFromStorage: vi.fn(),
      });

      renderSidebar('/cases');
      const overviewLink = screen.getByText('Overview').closest('a');
      expect(overviewLink).not.toHaveClass('bg-surface-sidebar-active');
    });
  });
});
