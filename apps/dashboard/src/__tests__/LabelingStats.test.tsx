import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LabelingStatsBar from '../components/fraud-ops/LabelingStats';
import type { LabelingStats } from '../types/fraud-ops.types';

const makeStats = (overrides: Partial<LabelingStats['today']> = {}, pendingReview = 5): LabelingStats => ({
  today: {
    labeled: 20,
    fraudConfirmed: 14,
    falsePositives: 4,
    inconclusive: 2,
    accuracy: 0.78,
    ...overrides,
  },
  pendingReview,
});

describe('LabelingStats', () => {
  it('shows labeled count', () => {
    render(<LabelingStatsBar stats={makeStats()} />);
    expect(screen.getByTestId('stat-labeled')).toHaveTextContent('20');
  });

  it('shows fraud confirmed count', () => {
    render(<LabelingStatsBar stats={makeStats()} />);
    expect(screen.getByTestId('stat-fraud')).toHaveTextContent('14');
  });

  it('shows false positive count', () => {
    render(<LabelingStatsBar stats={makeStats()} />);
    expect(screen.getByTestId('stat-fp')).toHaveTextContent('4');
  });

  it('shows accuracy percentage', () => {
    render(<LabelingStatsBar stats={makeStats({ accuracy: 0.78 })} />);
    expect(screen.getByTestId('stat-accuracy')).toHaveTextContent('78%');
  });

  it('applies green color when accuracy >= 0.8', () => {
    render(<LabelingStatsBar stats={makeStats({ accuracy: 0.85 })} />);
    const el = screen.getByTestId('stat-accuracy');
    expect(el.className).toMatch(/text-green/);
  });

  it('applies amber color when accuracy is between 0.6 and 0.8', () => {
    render(<LabelingStatsBar stats={makeStats({ accuracy: 0.7 })} />);
    const el = screen.getByTestId('stat-accuracy');
    expect(el.className).toMatch(/text-amber/);
  });

  it('applies red color when accuracy < 0.6', () => {
    render(<LabelingStatsBar stats={makeStats({ accuracy: 0.4 })} />);
    const el = screen.getByTestId('stat-accuracy');
    expect(el.className).toMatch(/text-red/);
  });

  it('shows pending review badge when pendingReview > 0', () => {
    render(<LabelingStatsBar stats={makeStats({}, 12)} />);
    expect(screen.getByTestId('stat-pending')).toHaveTextContent('12');
  });

  it('hides pending badge when pendingReview is 0', () => {
    render(<LabelingStatsBar stats={makeStats({}, 0)} />);
    expect(screen.queryByTestId('stat-pending')).not.toBeInTheDocument();
  });

  it('renders loading skeleton when stats is null', () => {
    const { container } = render(<LabelingStatsBar stats={null} />);
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });
});
