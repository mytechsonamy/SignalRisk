import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-background px-4 text-center">
      <div className="mb-4">
        <svg
          className="mx-auto h-12 w-12 text-decision-block"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-text-primary">Access Denied</h1>
      <p className="mt-2 text-sm text-text-secondary">
        You do not have permission to view this page.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-brand-primary-hover transition-colors duration-fast"
      >
        Return to Overview
      </Link>
    </div>
  );
}
