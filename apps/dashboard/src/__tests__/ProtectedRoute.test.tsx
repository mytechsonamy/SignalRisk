import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { useAuthStore } from '../store/auth.store';

vi.mock('../store/auth.store');

const mockInitFromStorage = vi.fn();

function renderWithRouter(
  element: React.ReactNode,
  initialPath = '/',
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
        <Route path="/" element={element} />
        <Route path="/admin" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      initFromStorage: mockInitFromStorage,
    });

    renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /unauthorized when user role is not in allowedRoles', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'analyst@test.com', role: 'analyst' },
      login: vi.fn(),
      logout: vi.fn(),
      initFromStorage: mockInitFromStorage,
    });

    renderWithRouter(
      <ProtectedRoute allowedRoles={['admin']}>
        <div>Admin Only Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
    expect(screen.queryByText('Admin Only Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated with no role restriction', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'analyst@test.com', role: 'analyst' },
      login: vi.fn(),
      logout: vi.fn(),
      initFromStorage: mockInitFromStorage,
    });

    renderWithRouter(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders children when user role matches allowedRoles', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'admin@test.com', role: 'admin' },
      login: vi.fn(),
      logout: vi.fn(),
      initFromStorage: mockInitFromStorage,
    });

    renderWithRouter(
      <ProtectedRoute allowedRoles={['admin']}>
        <div>Admin Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('allows analyst when role is in allowedRoles list', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'analyst@test.com', role: 'analyst' },
      login: vi.fn(),
      logout: vi.fn(),
      initFromStorage: mockInitFromStorage,
    });

    renderWithRouter(
      <ProtectedRoute allowedRoles={['analyst', 'admin']}>
        <div>Cases Content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('Cases Content')).toBeInTheDocument();
  });
});
