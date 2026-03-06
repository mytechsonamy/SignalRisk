import { useState, useRef, useCallback } from 'react';
import { useFraudOpsStore } from '../../store/fraud-ops.store';
import type { Case } from '../../types/case.types';

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function riskScoreColor(score: number): string {
  if (score >= 80) return 'text-red-600 font-bold';
  if (score >= 60) return 'text-amber-600 font-semibold';
  return 'text-green-600';
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-surface-hover" />
        </td>
      ))}
    </tr>
  );
}

export default function CaseReviewQueue() {
  const {
    reviewCases,
    selectedCaseIds,
    isLoading,
    toggleCaseSelection,
    claimCase,
    openOutcomeModal,
  } = useFraudOpsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Case[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback(
    debounce((query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        abortRef.current?.abort();
        abortRef.current = null;
        setSearchResults(null);
        setSearching(false);
        setSearchError(null);
        return;
      }
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setSearching(true);
      setSearchError(null);
      fetch(`/api/v1/cases?action=REVIEW&search=${encodeURIComponent(trimmed)}`, {
        signal: abortRef.current.signal,
      })
        .then((r) => r.json())
        .then((data: { cases?: Case[] } | Case[]) => {
          const cases = Array.isArray(data) ? data : (data.cases ?? []);
          setSearchResults(cases);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') {
            setSearchError(e.message);
          }
        })
        .finally(() => {
          setSearching(false);
        });
    }, 300),
    [],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (!value.trim()) {
      abortRef.current?.abort();
      abortRef.current = null;
      setSearchResults(null);
      setSearching(false);
      setSearchError(null);
    } else {
      doSearch(value);
    }
  };

  const displayedCases = searchResults !== null ? searchResults : reviewCases;
  const hasActiveQuery = searchQuery.trim().length > 0;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface-card overflow-hidden" data-testid="case-review-queue">
        <div className="px-4 py-3 border-b border-surface-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Review Queue</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary w-8" />
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Priority</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Merchant</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Risk Score</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">SLA Deadline</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border" data-testid="skeleton-rows">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reviewCases.length === 0 && !hasActiveQuery) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface-card overflow-hidden" data-testid="case-review-queue">
        <div className="px-4 py-3 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-text-primary">Review Queue</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <p>No cases pending review</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card overflow-hidden" data-testid="case-review-queue">
      <div className="px-4 py-3 border-b border-surface-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          Review Queue ({displayedCases.length})
        </h2>
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by entity, merchant, or case ID…"
            aria-label="Search cases"
            data-testid="case-search-input"
            className="w-64 rounded-md border border-surface-border bg-surface-card px-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          {searching && (
            <span
              className="text-xs text-text-secondary animate-pulse"
              data-testid="searching-indicator"
            >
              Searching…
            </span>
          )}
          {searchError && (
            <span className="text-xs text-red-600" data-testid="search-error">
              {searchError}
            </span>
          )}
        </div>
      </div>
      {hasActiveQuery && !searching && displayedCases.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-10 text-text-secondary text-sm"
          data-testid="no-search-results"
        >
          <p>No cases match your search</p>
        </div>
      )}
      {(displayedCases.length > 0 || (!hasActiveQuery && !searching)) && (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary w-8" />
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Priority</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Merchant</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Risk Score</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">SLA Deadline</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {displayedCases.map((c: Case) => {
              const isSelected = selectedCaseIds.includes(c.id);
              const isInReview = c.status === 'IN_REVIEW';
              const slaDate = new Date(c.slaDeadline);
              const slaBreached = slaDate < new Date();

              return (
                <tr
                  key={c.id}
                  className={`transition-colors hover:bg-surface-hover ${isSelected ? 'bg-brand-primary/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCaseSelection(c.id)}
                      aria-label={`Select case ${c.id}`}
                      className="h-4 w-4 rounded border-surface-border text-brand-primary focus:ring-brand-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.priority === 'HIGH'
                          ? 'bg-red-100 text-red-700'
                          : c.priority === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {c.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{c.merchantId}</td>
                  <td className={`px-4 py-3 ${riskScoreColor(c.riskScore)}`}>{c.riskScore}</td>
                  <td className={`px-4 py-3 text-xs ${slaBreached ? 'text-red-600 font-semibold' : 'text-text-secondary'}`}>
                    {slaDate.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {isInReview ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600 font-medium">IN_REVIEW</span>
                        <button
                          onClick={() => openOutcomeModal(c.id)}
                          className="rounded-md bg-brand-primary px-3 py-1 text-xs font-semibold text-white hover:bg-brand-primary/90 transition-colors"
                          data-testid={`submit-outcome-${c.id}`}
                        >
                          Submit Outcome
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => claimCase(c.id)}
                        className="rounded-md border border-surface-border px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover transition-colors"
                        data-testid={`claim-${c.id}`}
                      >
                        Claim
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
