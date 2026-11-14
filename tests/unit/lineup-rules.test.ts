import { describe, expect, it } from 'vitest';
import { defBonusTriggered } from '@/lib/game/cards';

describe('DEF auto bonus', () => {
  it('triggers when team wins by >= 2 goals', () => {
    expect(defBonusTriggered({ teamGoals: 3, oppGoals: 1 })).toBe(true);
    expect(defBonusTriggered({ teamGoals: 2, oppGoals: 0 })).toBe(true);
    expect(defBonusTriggered({ teamGoals: 2, oppGoals: 1 })).toBe(false);
    expect(defBonusTriggered({ teamGoals: 1, oppGoals: 1 })).toBe(false);
  });
});
