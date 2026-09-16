import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CategoryRevealDisplay from './CategoryRevealDisplay';

const CATS = ['SCIENCE', 'HISTORY', 'MUSIC', 'MOVIES', 'SPORTS', 'ART'];

describe('CategoryRevealDisplay', () => {
  it('shows JEOPARDY! title card on step 0 for round 1', () => {
    render(<CategoryRevealDisplay categories={CATS} step={0} round={1} />);
    expect(screen.getByText('JEOPARDY!')).toBeInTheDocument();
    expect(screen.queryByText('DOUBLE JEOPARDY!')).not.toBeInTheDocument();
  });

  it('shows DOUBLE JEOPARDY! title card on step 0 for round 2', () => {
    render(<CategoryRevealDisplay categories={CATS} step={0} round={2} />);
    expect(screen.getByText('DOUBLE JEOPARDY!')).toBeInTheDocument();
  });

  it('shows the correct category name on steps 1–6', () => {
    for (let step = 1; step <= 6; step++) {
      const { unmount } = render(<CategoryRevealDisplay categories={CATS} step={step} round={1} />);
      expect(screen.getByText(CATS[step - 1])).toBeInTheDocument();
      expect(screen.getByText(`CATEGORY ${step} OF ${CATS.length}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('does not show title card text during steps 1–6', () => {
    render(<CategoryRevealDisplay categories={CATS} step={1} round={1} />);
    expect(screen.queryByText('JEOPARDY!')).not.toBeInTheDocument();
  });
});
