import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HostReveal from './HostReveal';

const CATS = ['SCIENCE', 'HISTORY', 'MUSIC', 'MOVIES', 'SPORTS', 'ART'];

describe('HostReveal', () => {
  it('shows INTRO CARD label at step 0', () => {
    render(<HostReveal categories={CATS} step={0} onReveal={() => {}} />);
    expect(screen.getByText('INTRO CARD')).toBeInTheDocument();
  });

  it('shows progress label at steps 1–5', () => {
    render(<HostReveal categories={CATS} step={3} onReveal={() => {}} />);
    expect(screen.getByText('CATEGORY 3 OF 6 REVEALED')).toBeInTheDocument();
  });

  it('shows Reveal Next button before all categories revealed', () => {
    render(<HostReveal categories={CATS} step={0} onReveal={() => {}} />);
    expect(screen.getByRole('button', { name: /Reveal Next/i })).toBeInTheDocument();
  });

  it('shows Show Board button when all categories revealed (step === categories.length)', () => {
    render(<HostReveal categories={CATS} step={6} onReveal={() => {}} />);
    expect(screen.getByRole('button', { name: /Show Board/i })).toBeInTheDocument();
  });

  it('calls onReveal when button is clicked', () => {
    const onReveal = vi.fn();
    render(<HostReveal categories={CATS} step={2} onReveal={onReveal} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('shows checkmarks for revealed categories and dims future ones', () => {
    render(<HostReveal categories={CATS} step={3} onReveal={() => {}} />);
    // First 3 categories shown (indices 0,1,2 < step=3)
    const checkmarks = screen.getAllByText('✓');
    expect(checkmarks).toHaveLength(3);
  });

  it('lists all category names', () => {
    render(<HostReveal categories={CATS} step={0} onReveal={() => {}} />);
    CATS.forEach(name => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });
});
