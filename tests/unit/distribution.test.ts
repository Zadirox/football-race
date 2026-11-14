import { describe, expect, it } from 'vitest';
import { distributionPercent, distributionTotal } from '@/lib/game/distribution';

describe('distribution helpers', () => {
  it('counts total votes', () => {
    expect(distributionTotal({ home: 3, draw: 1, away: 6 })).toBe(10);
    expect(distributionTotal(null)).toBe(0);
    expect(distributionTotal({})).toBe(0);
  });

  it('returns percent for an option', () => {
    const dist = { home: 1, away: 3 };
    expect(distributionPercent(dist, 'home')).toBe(25);
    expect(distributionPercent(dist, 'away')).toBe(75);
    expect(distributionPercent(dist, 'draw')).toBe(0);
  });

  it('handles empty or null distribution safely', () => {
    expect(distributionPercent(null, 'home')).toBe(0);
    expect(distributionPercent({}, 'home')).toBe(0);
  });

  it('rounds to whole percent', () => {
    const dist = { a: 1, b: 2 };
    expect(distributionPercent(dist, 'a')).toBe(33);
    expect(distributionPercent(dist, 'b')).toBe(67);
  });
});
