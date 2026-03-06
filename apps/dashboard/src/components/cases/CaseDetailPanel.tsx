import { useState } from 'react';
import type { Case } from '../../types/case.types';
import { useCasesStore } from '../../store/cases.store';
import Badge from '../ui/Badge';
import PriorityBadge from './PriorityBadge';
import SlaIndicator from './SlaIndicator';

interface Props {
  caseData: Case | null;
  onClose: () => void;
}

const RESOLUTIONS = ['FRAUD', 'LEGITIMATE', 'INCONCLUSIVE'] as const;
type Resolution = (typeof RESOLUTIONS)[number];

export default function CaseDetailPanel({ caseData, onClose }: Props) {
  const { resolveCase, escalateCase } = useCasesStore();
  const [resolution, setResolution] = useState<Resolution>('FRAUD');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isOpen = caseData !== null;
  const canResolve = caseData?.status === 'OPEN' || caseData?.status === 'IN_REVIEW';
  const canEscalate = caseData?.status === 'OPEN';

  const handleResolve = async () => {
    if (!caseData) return;
    setSubmitting(true);
    try {
      await resolveCase(caseData.id, resolution, notes);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalate = async () => {
    if (!caseData) return;
    setSubmitting(true);
    try {
      await escalateCase(caseData.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-surface-overlay z-30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Case detail panel"
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {caseData && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
              <div>
                <p className="text-xs text-text-secondary font-mono">Case</p>
                <h2 className="text-sm font-semibold font-mono text-text-primary">{caseData.id}</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body (scrollable) */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Decision Summary */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Decision Summary
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Action</span>
                    <Badge action={caseData.action} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Risk Score</span>
                    <span className="text-sm font-semibold font-mono text-text-primary">
                      {caseData.riskScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Entity ID</span>
                    <span className="text-sm font-mono text-text-primary">{caseData.entityId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Priority</span>
                    <PriorityBadge priority={caseData.priority} />
                  </div>
                </div>
              </section>

              {/* Risk Factors */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Risk Factors
                </h3>
                <div className="space-y-3">
                  {caseData.riskFactors.map((factor, idx) => (
                    <div key={idx} className="rounded-md border border-surface-border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-medium text-text-primary">
                          {factor.signal}
                        </span>
                        <span className="text-xs font-semibold text-text-primary">
                          {factor.contribution}%
                        </span>
                      </div>
                      <div className="mb-1.5 h-1.5 w-full rounded-full bg-gray-200">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${Math.min(factor.contribution, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-secondary">{factor.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* SLA */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  SLA
                </h3>
                <SlaIndicator
                  slaDeadline={caseData.slaDeadline}
                  createdAt={caseData.createdAt}
                  status={caseData.status}
                />
              </section>

              {/* Evidence Timeline */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Evidence Timeline
                </h3>
                {caseData.evidenceTimeline && caseData.evidenceTimeline.length > 0 ? (
                  <ol className="relative border-l border-surface-border space-y-4 ml-2">
                    {caseData.evidenceTimeline.map((item, idx) => (
                      <li key={idx} className="ml-4">
                        <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-primary" />
                        <p className="text-xs text-text-muted font-mono">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </p>
                        <p className="text-xs font-medium text-text-primary mt-0.5">
                          {item.description}
                        </p>
                        {item.type && (
                          <span className="inline-block mt-0.5 rounded bg-surface-hover px-1.5 py-0.5 text-xs text-text-secondary">
                            {item.type}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-text-muted">No evidence recorded</p>
                )}
              </section>

              {/* Resolution Form */}
              {canResolve && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Resolution
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="resolution-select"
                        className="block text-xs font-medium text-text-secondary mb-1"
                      >
                        Decision
                      </label>
                      <select
                        id="resolution-select"
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value as Resolution)}
                        className="w-full rounded-md border border-surface-border px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {RESOLUTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="resolution-notes"
                        className="block text-xs font-medium text-text-secondary mb-1"
                      >
                        Notes
                      </label>
                      <textarea
                        id="resolution-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Add resolution notes..."
                        className="w-full rounded-md border border-surface-border px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                    </div>

                    <button
                      onClick={handleResolve}
                      disabled={submitting}
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
                    >
                      {submitting ? 'Submitting...' : 'Submit Resolution'}
                    </button>
                  </div>
                </section>
              )}

              {/* Escalate */}
              {canEscalate && (
                <section>
                  <button
                    onClick={handleEscalate}
                    disabled={submitting}
                    className="w-full rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Escalate Case
                  </button>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
