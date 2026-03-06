export default function TargetManagementPage() {
  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Target Management</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage fraud detection targets for Battle Arena
          </p>
        </div>
        <button
          disabled
          className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-text-muted cursor-not-allowed opacity-50"
          title="Available in Sprint 18"
        >
          + Add Target
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-3 border border-primary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">SignalRisk (Default)</p>
                <p className="text-xs text-text-secondary">localhost:3002</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Connected
            </span>
          </div>

          <div className="rounded-md bg-surface-sidebar p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Environment</span>
              <span className="text-text-primary font-medium">Development</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Auth</span>
              <span className="text-text-primary font-medium">API Key</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Last ping</span>
              <span className="text-text-primary font-medium">just now</span>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Default target configured from environment settings. Additional targets available in Sprint 18.
          </p>
        </div>
      </div>
    </div>
  );
}
