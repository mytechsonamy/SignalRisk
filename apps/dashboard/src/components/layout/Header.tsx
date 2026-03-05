import { useAuthStore } from '../../store/auth.store';

const roleConfig = {
  admin: { label: 'Admin', className: 'bg-brand-primary/10 text-brand-primary' },
  analyst: { label: 'Analyst', className: 'bg-brand-secondary/10 text-brand-secondary' },
};

export default function Header() {
  const { user, logout } = useAuthStore();

  if (!user) return null;

  const role = roleConfig[user.role];
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <header
      className="flex h-14 flex-shrink-0 items-center justify-between border-b border-surface-border bg-surface-card px-6"
      role="banner"
    >
      <div />

      <div className="flex items-center gap-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${role.className}`}
          data-testid="role-badge"
        >
          {role.label}
        </span>

        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-text-inverse"
            aria-label={`User: ${user.email}`}
          >
            {initials}
          </div>
          <span className="hidden text-sm font-medium text-text-primary sm:block">
            {user.email}
          </span>
        </div>

        <button
          onClick={logout}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
          aria-label="Sign out"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
