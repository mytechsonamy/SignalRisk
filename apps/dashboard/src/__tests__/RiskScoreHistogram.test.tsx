import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskScoreHistogram from '../components/analytics/RiskScoreHistogram';
import type { RiskBucket } from '../types/analytics.types';

const mockBuckets: RiskBucket[] = [
  { range: '0-10', count: 120 },
  { range: '10-20', count: 200 },
  { range: '20-30', count: 180 },
  { range: '30-40', count: 150 },
  { range: '40-50', count: 100 },
  { range: '50-60', count: 80 },
  { range: '60-70', count: 60 },
  { range: '70-80', count: 40 },
  { range: '80-90', count: 20 },
  { range: '90-100', count: 10 },
];

describe('RiskScoreHistogram', () => {
  it('renders the chart title', () => {
    render(<RiskScoreHistogram data={mockBuckets} />);
    expect(screen.getByText('Risk Score Distribution')).toBeInTheDocument();
  });

  it('renders without crashing with 10 buckets', () => {
    const { container } = render(<RiskScoreHistogram data={mockBuckets} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders the recharts responsive container element', () => {
    const { container } = render(<RiskScoreHistogram data={mockBuckets} />);
    // ResponsiveContainer renders a div wrapper even without dimensions in jsdom
    const rechartsDiv = container.querySelector('.recharts-responsive-container');
    expect(rechartsDiv).not.toBeNull();
  });

  it('renders with empty data without crashing', () => {
    const { container } = render(<RiskScoreHistogram data={[]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('wraps content in a card div', () => {
    const { container } = render(<RiskScoreHistogram data={mockBuckets} />);
    const card = container.querySelector('.rounded-lg');
    expect(card).not.toBeNull();
  });
});
