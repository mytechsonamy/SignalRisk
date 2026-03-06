import { useState } from 'react';
import { useFraudTesterStore } from '../store/fraud-tester.store';
import { fraudTesterApi } from '../api/fraud-tester.api';
import type { AdapterTarget } from '../types/fraud-tester.types';

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AdapterTarget['connectionStatus'] }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Connected
      </span>
    );
  }
  if (status === 'testing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs font-semibold text-yellow-400">
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Testing…
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Failed
      </span>
    );
  }
  // unknown / undefined
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-border px-2 py-0.5 text-xs font-semibold text-text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
      Unknown
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TargetManagementPage() {
  const {
    targets,
    activeTargetId,
    addTarget,
    removeTarget,
    setActiveTarget,
    updateTargetStatus,
  } = useFraudTesterStore();

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formMerchantId, setFormMerchantId] = useState('');
  const [formTesting, setFormTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setFormName('');
    setFormBaseUrl('');
    setFormApiKey('');
    setFormMerchantId('');
    setFormError(null);
    setFormTesting(false);
  };

  const testConnection = async (target: AdapterTarget) => {
    updateTargetStatus(target.id, 'testing');
    try {
      const result = await fraudTesterApi.healthCheck(target.baseUrl, target.apiKey);
      updateTargetStatus(target.id, result ? 'connected' : 'failed');
    } catch {
      updateTargetStatus(target.id, 'failed');
    }
  };

  const handleFormTest = async () => {
    if (!formBaseUrl.trim()) {
      setFormError('Base URL is required');
      return;
    }
    setFormTesting(true);
    setFormError(null);
    try {
      const result = await fraudTesterApi.healthCheck(
        formBaseUrl.trim(),
        formApiKey.trim() || undefined,
      );
      if (!result) setFormError('Connection failed — target returned an error');
    } catch {
      setFormError('Connection failed — could not reach the target');
    } finally {
      setFormTesting(false);
    }
  };

  const handleFormSave = () => {
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!formBaseUrl.trim()) {
      setFormError('Base URL is required');
      return;
    }
    addTarget({
      name: formName.trim(),
      type: 'custom',
      baseUrl: formBaseUrl.trim(),
      apiKey: formApiKey.trim() || undefined,
      merchantId: formMerchantId.trim() || undefined,
      connectionStatus: 'unknown',
    });
    resetForm();
    setShowForm(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Target Management</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage fraud detection targets for Battle Arena
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(null); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {showForm ? 'Cancel' : 'Add New Target'}
        </button>
      </div>

      {/* ── Section 1: Active Targets ─────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3 px-1">
          Active Targets
        </h2>
        <div className="space-y-3 max-w-2xl">
          {targets.map((target) => (
            <TargetCard
              key={target.id}
              target={target}
              isActive={target.id === activeTargetId}
              onTest={() => testConnection(target)}
              onSelect={() => setActiveTarget(target.id)}
              onRemove={target.isDefault ? undefined : () => removeTarget(target.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Section 2: Add New Target Form ────────────────────────────────── */}
      {showForm && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3 px-1">
            Add New Target
          </h2>
          <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-4 max-w-lg border border-surface-border">
            <p className="text-xs text-text-secondary">
              Connect any HTTP-compatible fraud detection system as a battle target.
            </p>

            {formError && (
              <div className="rounded-md bg-red-900/20 border border-red-700/40 px-3 py-2 text-xs text-red-400">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              {/* Name */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="My Fraud System"
                  className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-sm px-3 py-2 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {/* Base URL */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">Base URL</label>
                <input
                  type="url"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder="https://your-service.example.com"
                  className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-sm px-3 py-2 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">
                  API Key <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder="sk_test_••••••••••••••••"
                  className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-sm px-3 py-2 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {/* Merchant ID */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">
                  Merchant ID <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formMerchantId}
                  onChange={(e) => setFormMerchantId(e.target.value)}
                  placeholder="merchant-abc-123"
                  className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-sm px-3 py-2 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleFormTest}
                  disabled={formTesting || !formBaseUrl.trim()}
                  className="flex-1 rounded-md border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formTesting ? 'Testing…' : 'Test Connection'}
                </button>
                <button
                  onClick={handleFormSave}
                  disabled={!formName.trim() || !formBaseUrl.trim()}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Target
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TargetCard sub-component
// ---------------------------------------------------------------------------

interface TargetCardProps {
  target: AdapterTarget;
  isActive: boolean;
  onTest: () => void;
  onSelect: () => void;
  onRemove?: () => void;
}

function TargetCard({ target, isActive, onTest, onSelect, onRemove }: TargetCardProps) {
  return (
    <div
      className={`rounded-lg bg-surface-card shadow-md p-4 border transition-colors ${
        isActive ? 'border-primary/50' : 'border-surface-border'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: icon + info */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              target.isDefault ? 'bg-primary/20' : 'bg-surface-border'
            }`}
          >
            {target.isDefault ? (
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-text-primary truncate">{target.name}</p>
              {target.isDefault && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                  Default
                </span>
              )}
              {isActive && (
                <span className="rounded-full bg-green-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-green-400 uppercase tracking-wide">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary font-mono truncate">{target.baseUrl}</p>
            {target.lastTestedAt && (
              <p className="text-[10px] text-text-muted mt-0.5">
                Last tested: {target.lastTestedAt.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={target.connectionStatus} />

          {!isActive && (
            <button
              onClick={onSelect}
              className="rounded-md border border-surface-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-primary/40 transition-colors"
            >
              Select
            </button>
          )}

          <button
            onClick={onTest}
            disabled={target.connectionStatus === 'testing'}
            className="rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Test
          </button>

          {onRemove && (
            <button
              onClick={onRemove}
              className="rounded-md border border-red-700/40 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-900/20 transition-colors"
              title="Remove target"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
