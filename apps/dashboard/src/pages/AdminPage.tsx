import { useEffect } from 'react';
import { useAdminStore } from '../store/admin.store';
import { useAuthStore } from '../store/auth.store';
import { Navigate } from 'react-router-dom';
import UsersTab from '../components/admin/UsersTab';
import SystemHealthTab from '../components/admin/SystemHealthTab';
import RulesTab from '../components/admin/RulesTab';

const TABS: Array<{ key: 'users' | 'health' | 'rules'; label: string }> = [
  { key: 'users', label: 'Users' },
  { key: 'health', label: 'System Health' },
  { key: 'rules', label: 'Rules' },
];

export default function AdminPage() {
  const { user } = useAuthStore();
  const { activeTab, setActiveTab, fetchUsers, fetchRules, error } = useAdminStore();

  if (!user || user.role !== 'admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    fetchUsers();
    fetchRules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Admin</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage users, system health, and rule configuration.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-1 border-b border-surface-border" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'health' && <SystemHealthTab />}
        {activeTab === 'rules' && <RulesTab />}
      </div>
    </div>
  );
}
