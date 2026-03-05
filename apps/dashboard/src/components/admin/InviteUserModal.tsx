import { useState } from 'react';
import { useAdminStore } from '../../store/admin.store';

interface Props {
  onClose: () => void;
}

export default function InviteUserModal({ onClose }: Props) {
  const { inviteUser } = useAdminStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'analyst' | 'viewer'>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await inviteUser(email, role);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to invite user';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Invite User"
    >
      <div className="w-full max-w-md rounded-lg bg-surface-card border border-surface-border p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Invite User</h2>

        {error && (
          <div role="alert" className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-text-primary mb-1">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@example.com"
              className="w-full rounded-md border border-surface-border bg-surface-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium text-text-primary mb-1">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'analyst' | 'viewer')}
              className="w-full rounded-md border border-surface-border bg-surface-input px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="viewer">Viewer</option>
              <option value="analyst">Analyst</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Inviting…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
