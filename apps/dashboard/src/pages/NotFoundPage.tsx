import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-background px-4 text-center">
      <h1 className="text-[2rem] font-bold text-text-primary">404</h1>
      <h2 className="mt-2 text-xl font-semibold text-text-primary">Page not found</h2>
      <p className="mt-2 text-sm text-text-secondary">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-text-inverse hover:bg-brand-primary-hover transition-colors duration-fast"
      >
        Go to Overview
      </Link>
    </div>
  );
}
