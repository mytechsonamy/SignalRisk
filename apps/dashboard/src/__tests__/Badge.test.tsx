import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../components/ui/Badge';

describe('Badge', () => {
  it('renders ALLOW badge with green styling', () => {
    render(<Badge action="ALLOW" />);
    const badge = screen.getByText('ALLOW');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-decision-allow');
    expect(badge).toHaveClass('bg-decision-allow/10');
  });

  it('renders REVIEW badge with amber styling', () => {
    render(<Badge action="REVIEW" />);
    const badge = screen.getByText('REVIEW');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-decision-review');
    expect(badge).toHaveClass('bg-decision-review/10');
  });

  it('renders BLOCK badge with red styling', () => {
    render(<Badge action="BLOCK" />);
    const badge = screen.getByText('BLOCK');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-decision-block');
    expect(badge).toHaveClass('bg-decision-block/10');
  });

  it('has correct data-action attribute', () => {
    render(<Badge action="BLOCK" />);
    const badge = screen.getByText('BLOCK');
    expect(badge).toHaveAttribute('data-action', 'BLOCK');
  });
});
