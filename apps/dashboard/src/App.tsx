import { lazy, Suspense, useEffect, useState } from 'react';
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
import RulesTab from './components/admin/RulesTab';
import { useAdminStore } from './store/admin.store';

const LiveFeedPage = lazy(() => import('./pages/LiveFeedPage'));
const GraphIntelPage = lazy(() => import('./pages/GraphIntelPage'));

function RulesPage() {
  const { fetchRules } = useAdminStore();

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Rules</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Rule engine configuration — manage fraud detection rules, weights, and expressions.
        </p>
      </div>
      <div className="rounded-lg bg-surface-card shadow-md p-6">
        <RulesTab />
      </div>
    </div>
  );
}

const SETTING_FIELDS = [
  { key: 'apiBaseUrl', label: 'API Base URL', defaultValue: 'http://localhost:3000' },
  { key: 'wsUrl', label: 'WebSocket URL', defaultValue: 'http://localhost:3000' },
  { key: 'environment', label: 'Environment', defaultValue: 'development' },
  { key: 'version', label: 'Version', defaultValue: '0.1.0' },
] as const;

function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const defaults = Object.fromEntries(SETTING_FIELDS.map(f => [f.key, f.defaultValue]));
    try {
      const stored = localStorage.getItem('signalrisk_settings');
      if (stored) return { ...defaults, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return defaults;
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Persist to localStorage so settings survive page reload
      localStorage.setItem('signalrisk_settings', JSON.stringify(values));
      setSaveError(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError(true);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">Platform configuration and preferences.</p>
      </div>
      <form onSubmit={handleSubmit} className="rounded-lg bg-surface-card shadow-md divide-y divide-surface-border">
        {SETTING_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between px-5 py-4">
            <label htmlFor={`setting-${key}`} className="text-sm font-medium text-text-primary">
              {label}
            </label>
            <input
              id={`setting-${key}`}
              value={values[key]}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              className="w-64 rounded-md border border-surface-border px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        ))}
        <div className="flex items-center justify-end px-5 py-4 gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium">Saved</span>
          )}
          {saveError && (
            <span className="text-sm text-red-600 font-medium">Settings could not be saved</span>
          )}
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            Save Settings
          </button>
        </div>
      </form>
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
            path="graph-intel"
            element={
              <ProtectedRoute allowedRoles={['analyst', 'admin']}>
                <Suspense fallback={<div className="p-6">Loading…</div>}>
                  <GraphIntelPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
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
