import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import CasesPage from './pages/CasesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';
import FraudOpsPage from './pages/FraudOpsPage';
import NotFoundPage from './pages/NotFoundPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/auth/ProtectedRoute';

const LiveFeedPage = lazy(() => import('./pages/LiveFeedPage'));

function RulesPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-text-primary">Rules</h1>
      <p className="mt-2 text-text-secondary">Rule engine configuration — coming soon.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route
            path="cases"
            element={
              <ProtectedRoute allowedRoles={['analyst', 'admin']}>
                <CasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="rules"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="fraud-ops"
            element={
              <ProtectedRoute allowedRoles={['admin', 'analyst']}>
                <FraudOpsPage />
              </ProtectedRoute>
            }
          />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route
            path="live-feed"
            element={
              <Suspense fallback={<div className="p-6">Loading…</div>}>
                <LiveFeedPage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
