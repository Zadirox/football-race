import { describe, expect, it } from 'vitest';
import {
  CARD_RARITY_ODDS,
  LINEUP_POINTS,
  canSlotCard,
  isOutfield,
  matchdayPackCount,
  rollRarity,
} from '@/lib/game/cards';

describe('card rarity odds', () => {
  it('odds 70/22/7/1 sum to 100', () => {
    expect(CARD_RARITY_ODDS).toEqual({ common: 70, rare: 22, epic: 7, legend: 1 });
    expect(
      CARD_RARITY_ODDS.common +
        CARD_RARITY_ODDS.rare +
        CARD_RARITY_ODDS.epic +
        CARD_RARITY_ODDS.legend,
    ).toBe(100);
  });
});

describe('lineup points mapping', () => {
  it('maps common10/rare20/epic30/legend40', () => {
    expect(LINEUP_POINTS).toEqual({ common: 10, rare: 20, epic: 30, legend: 40 });
  });
});

describe('matchdayPackCount', () => {
  it('returns 2 for gold, else 1 for silver/bronze/wood/null', () => {
    expect(matchdayPackCount('gold')).toBe(2);
    expect(matchdayPackCount('silver')).toBe(1);
    expect(matchdayPackCount('bronze')).toBe(1);
    expect(matchdayPackCount('wood')).toBe(1);
    expect(matchdayPackCount(null)).toBe(1);
  });
});

describe('rollRarity deterministic edges', () => {
  it('returns common at 0 and 0.699999, rare at 0.700001, legend at 0.999999', () => {
    expect(rollRarity(() => 0)).toBe('common');
    expect(rollRarity(() => 0.699999)).toBe('common');
    expect(rollRarity(() => 0.700001)).toBe('rare');
    expect(rollRarity(() => 0.999999)).toBe('legend');
  });
});

describe('canSlotCard', () => {
  it('GK slot only GK role_group', () => {
    expect(canSlotCard({ slot: 'GK', roleGroup: 'GK' })).toBe(true);
    expect(canSlotCard({ slot: 'GK', roleGroup: 'MID' })).toBe(false);
  });

  it('OF slots only non-GK (OF1 with MID true, OF1 with GK false)', () => {
    expect(canSlotCard({ slot: 'OF1', roleGroup: 'MID' })).toBe(true);
    expect(canSlotCard({ slot: 'OF1', roleGroup: 'GK' })).toBe(false);
    expect(canSlotCard({ slot: 'OF2', roleGroup: 'FWD' })).toBe(true);
    expect(canSlotCard({ slot: 'OF2', roleGroup: 'GK' })).toBe(false);
  });
});

describe('isOutfield', () => {
  it('returns true for non-GK roles', () => {
    expect(isOutfield('DEF')).toBe(true);
    expect(isOutfield('MID')).toBe(true);
    expect(isOutfield('FWD')).toBe(true);
    expect(isOutfield('GK')).toBe(false);
  });
});
