import { useState } from 'react';
import { useAdminStore } from '../../store/admin.store';
import InviteUserModal from './InviteUserModal';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

function formatDate(isoString: string | null): string {
  if (!isoString) return 'Never';
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function UsersTab() {
  const { users, isLoadingUsers, deactivateUser } = useAdminStore();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  const handleDeactivate = async (userId: string) => {
    if (confirmDeactivateId === userId) {
      await deactivateUser(userId);
      setConfirmDeactivateId(null);
    } else {
      setConfirmDeactivateId(userId);
    }
  };

  if (isLoadingUsers) {
    return (
      <div aria-label="Loading" className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md bg-surface-hover"
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Users</h2>
        <button
          onClick={() => setShowInviteModal(true)}
          className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 transition-colors"
        >
          Invite User
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="pb-2 text-left font-medium text-text-secondary">Email</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Role</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Status</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Last Login</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-surface-border/50">
                <td className="py-3 text-text-primary">{user.email}</td>
                <td className="py-3 text-text-secondary">{ROLE_LABELS[user.role] ?? user.role}</td>
                <td className="py-3">
                  {user.isActive ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-surface-hover border border-surface-border px-2 py-0.5 text-xs font-medium text-text-muted">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="py-3 text-text-secondary">{formatDate(user.lastLoginAt)}</td>
                <td className="py-3">
                  {user.isActive && (
                    <button
                      onClick={() => handleDeactivate(user.id)}
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                    >
                      {confirmDeactivateId === user.id ? 'Deactivate?' : 'Deactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-secondary">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showInviteModal && <InviteUserModal onClose={() => setShowInviteModal(false)} />}
    </div>
  );
}
