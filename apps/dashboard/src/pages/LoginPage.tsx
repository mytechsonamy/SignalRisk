import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import LoginForm from '../components/auth/LoginForm';

export default function LoginPage() {
  const { isAuthenticated, initFromStorage } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary">
            Signal<span className="text-brand-primary">Risk</span>
          </h1>
          <p className="mt-2 text-sm text-text-secondary">Sign in to your account</p>
        </div>

        <div className="rounded-xl bg-surface-card p-6 shadow-md">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
