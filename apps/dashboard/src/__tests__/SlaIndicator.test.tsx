import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SlaIndicator from '../components/cases/SlaIndicator';

const now = Date.now();

// Case created 1h ago, deadline 5h from now → total=6h, remaining=5h → ~83% → green
const greenCase = {
  createdAt: new Date(now - 1 * 3600_000).toISOString(),
  slaDeadline: new Date(now + 5 * 3600_000).toISOString(),
};

// Case created 5h ago, deadline 3h from now → total=8h, remaining=3h → 37.5% → amber
const amberCase = {
  createdAt: new Date(now - 5 * 3600_000).toISOString(),
  slaDeadline: new Date(now + 3 * 3600_000).toISOString(),
};

// Case created 10h ago, deadline 5min from now → total=10h5m, remaining=5min → ~0.8% → red
const redCase = {
  createdAt: new Date(now - 10 * 3600_000).toISOString(),
  slaDeadline: new Date(now + 5 * 60_000).toISOString(),
};

// Overdue
const overdueCase = {
  createdAt: new Date(now - 5 * 3600_000).toISOString(),
  slaDeadline: new Date(now - 1 * 3600_000).toISOString(),
};

describe('SlaIndicator', () => {
  it('shows green styling when >50% time remaining', () => {
    const { container } = render(
      <SlaIndicator {...greenCase} status="OPEN" />,
    );
    expect(container.firstChild).toHaveClass('text-green-600');
  });

  it('shows amber styling when 10-50% time remaining', () => {
    const { container } = render(
      <SlaIndicator {...amberCase} status="OPEN" />,
    );
    expect(container.firstChild).toHaveClass('text-amber-600');
  });

  it('shows red styling when <10% time remaining', () => {
    const { container } = render(
      <SlaIndicator {...redCase} status="OPEN" />,
    );
    expect(container.firstChild).toHaveClass('text-red-600');
  });

  it('shows "Overdue" and red styling when deadline has passed', () => {
    const { container } = render(
      <SlaIndicator {...overdueCase} status="OPEN" />,
    );
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-red-600');
  });

  it('shows "Resolved" text when status is RESOLVED', () => {
    render(
      <SlaIndicator {...greenCase} status="RESOLVED" />,
    );
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('shows "Resolved" text when status is ESCALATED', () => {
    render(
      <SlaIndicator {...greenCase} status="ESCALATED" />,
    );
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });
});
