import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DecisionTrend } from '../types/analytics.types';

// Mock recharts to avoid jsdom rendering issues with ResponsiveContainer/PieChart
vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data }: { data: Array<{ name: string; value: number }> }) => (
    <div data-testid="pie">
      {data.map((d) => (
        <span key={d.name} data-testid={`slice-${d.name}`}>
          {d.name}:{d.value}
        </span>
      ))}
    </div>
  ),
  Cell: () => null,
  Tooltip: () => null,
  Legend: ({ payload }: { payload?: Array<{ value: string }> }) => (
    <div data-testid="legend">
      {payload?.map((p) => <span key={p.value}>{p.value}</span>)}
    </div>
  ),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

import DecisionDonutChart from '../components/analytics/DecisionDonutChart';

const mockTrends: DecisionTrend[] = [
  { date: '2026-03-01', allow: 100, review: 20, block: 5 },
  { date: '2026-03-02', allow: 120, review: 18, block: 3 },
  { date: '2026-03-03', allow: 95, review: 25, block: 7 },
];

describe('DecisionDonutChart', () => {
  it('renders the chart title', () => {
    render(<DecisionDonutChart trends={mockTrends} />);
    expect(screen.getByText('Decision Outcomes')).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    const { container } = render(<DecisionDonutChart trends={mockTrends} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('shows ALLOW slice with correct total', () => {
    render(<DecisionDonutChart trends={mockTrends} />);
    // 100 + 120 + 95 = 315
    expect(screen.getByTestId('slice-ALLOW')).toHaveTextContent('ALLOW:315');
  });

  it('shows REVIEW slice with correct total', () => {
    render(<DecisionDonutChart trends={mockTrends} />);
    // 20 + 18 + 25 = 63
    expect(screen.getByTestId('slice-REVIEW')).toHaveTextContent('REVIEW:63');
  });

  it('shows BLOCK slice with correct total', () => {
    render(<DecisionDonutChart trends={mockTrends} />);
    // 5 + 3 + 7 = 15
    expect(screen.getByTestId('slice-BLOCK')).toHaveTextContent('BLOCK:15');
  });

  it('renders the pie chart element', () => {
    render(<DecisionDonutChart trends={mockTrends} />);
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders with empty trends without crashing', () => {
    const { container } = render(<DecisionDonutChart trends={[]} />);
    expect(container.firstChild).not.toBeNull();
  });
});
