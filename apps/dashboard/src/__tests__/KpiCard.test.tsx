import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiCard from '../components/ui/KpiCard';

describe('KpiCard', () => {
  it('renders the label', () => {
    render(
      <KpiCard
        icon={<span>icon</span>}
        label="Decisions / hr"
        value={1247}
      />,
    );
    expect(screen.getByText('Decisions / hr')).toBeInTheDocument();
  });

  it('renders the value', () => {
    render(
      <KpiCard
        icon={<span>icon</span>}
        label="Block Rate %"
        value="3.2%"
      />,
    );
    expect(screen.getByText('3.2%')).toBeInTheDocument();
  });

  it('does not show trend indicator when no trend provided', () => {
    render(
      <KpiCard
        icon={<span>icon</span>}
        label="Avg Latency ms"
        value={42}
      />,
    );
    expect(screen.queryByTestId('trend-indicator')).not.toBeInTheDocument();
  });

  it('shows trend indicator when trend is provided', () => {
    render(
      <KpiCard
        icon={<span>icon</span>}
        label="Decisions / hr"
        value={1247}
        trend={{ value: 12, direction: 'up', isPositive: true }}
      />,
    );
    expect(screen.getByTestId('trend-indicator')).toBeInTheDocument();
  });

  it('applies green color class for positive trend', () => {
    render(
      <KpiCard
        icon={<span>icon</span>}
        label="Decisions / hr"
        value={1247}
        trend={{ value: 12, direction: 'up', isPositive: true }}
      />,
    );
    const indicator = screen.getByTestId('trend-indicator');
    expect(indicator).toHaveClass('text-decision-allow');
  });

  it('applies red color class for negative trend', () => {
    render(
      <KpiCard
        icon={<span>icon</span>}
        label="Review Rate %"
        value="8.5%"
        trend={{ value: 1.2, direction: 'up', isPositive: false }}
      />,
    );
    const indicator = screen.getByTestId('trend-indicator');
    expect(indicator).toHaveClass('text-decision-block');
  });
});
