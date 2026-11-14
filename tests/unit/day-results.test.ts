import { describe, expect, it } from 'vitest';
import { dayResultDieLabel, shouldShowDaySummary } from '@/lib/game/day-results';

describe('day results helpers', () => {
  it('labels die tiers in Russian', () => {
    expect(dayResultDieLabel('wood')).toBe('деревянный');
    expect(dayResultDieLabel('bronze')).toBe('бронзовый');
    expect(dayResultDieLabel('silver')).toBe('серебряный');
    expect(dayResultDieLabel('gold')).toBe('золотой');
    expect(dayResultDieLabel(null)).toBeNull();
  });

  it('shows summary only when there is a result and it is not dismissed', () => {
    expect(shouldShowDaySummary('md-2', null)).toBe(true);
    expect(shouldShowDaySummary('md-2', 'md-1')).toBe(true);
    expect(shouldShowDaySummary('md-2', 'md-2')).toBe(false);
    expect(shouldShowDaySummary(null, null)).toBe(false);
  });
});
