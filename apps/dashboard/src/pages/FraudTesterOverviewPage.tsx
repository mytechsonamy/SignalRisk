import { useNavigate } from 'react-router-dom';
import KpiCard from '../components/ui/KpiCard';

function SwordIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 3.5l6 6-10 10-3-1-1-3 8-12zM3 21l3-3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

export default function FraudTesterOverviewPage() {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Fraud Tester</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Adversarial testing platform — simulate fraud attacks and measure detection performance
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="region" aria-label="Fraud Tester KPIs">
        <KpiCard
          icon={<SwordIcon />}
          label="Total Battles"
          value="47"
          trend={{ value: 8, direction: 'up', isPositive: true }}
        />
        <KpiCard
          icon={<ShieldIcon />}
          label="Avg Detection"
          value="83%"
          trend={{ value: 2, direction: 'up', isPositive: true }}
        />
        <KpiCard
          icon={<StarIcon />}
          label="Best Scenario"
          value="98%"
        />
        <KpiCard
          icon={<AlertIcon />}
          label="Needs Work"
          value="67%"
          trend={{ value: 5, direction: 'down', isPositive: false }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Best Scenario</p>
          <p className="text-sm font-semibold text-text-primary">Emulator Spoof</p>
          <p className="text-xs text-text-secondary">98% detection rate across 15 runs</p>
        </div>
        <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Needs Work</p>
          <p className="text-sm font-semibold text-text-primary">Velocity Evasion</p>
          <p className="text-xs text-text-secondary">67% detection rate — review behavioral rules</p>
        </div>
      </div>

      <div className="flex justify-center pt-4">
        <button
          onClick={() => navigate('/fraud-tester/battle-arena')}
          className="flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-base font-semibold text-white hover:bg-primary-hover transition-colors shadow-lg"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Start New Battle
        </button>
      </div>
    </div>
  );
}
