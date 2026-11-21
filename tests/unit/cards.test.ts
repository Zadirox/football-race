import { describe, expect, it } from 'vitest';
import {
  CARD_RARITY_ODDS,
  CLUB_BONUS_SECOND_CHANCE,
  CLUB_RARITY_ODDS,
  LINEUP_POINTS,
  NATIONAL_RARITY_ODDS,
  canSlotCard,
  isOutfield,
  matchdayPackCount,
  rollPackRarities,
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

describe('club rarity odds (2C.4, Variant C)', () => {
  it('odds 55/28/13/4 sum to 100 and bonus chance is 10%', () => {
    expect(CLUB_RARITY_ODDS).toEqual({ common: 55, rare: 28, epic: 13, legend: 4 });
    expect(
      CLUB_RARITY_ODDS.common +
        CLUB_RARITY_ODDS.rare +
        CLUB_RARITY_ODDS.epic +
        CLUB_RARITY_ODDS.legend,
    ).toBe(100);
    expect(CLUB_BONUS_SECOND_CHANCE).toBe(10);
  });

  it('rollRarity respects custom odds (club thresholds)', () => {
    expect(rollRarity(() => 0.549999, CLUB_RARITY_ODDS)).toBe('common');
    expect(rollRarity(() => 0.550001, CLUB_RARITY_ODDS)).toBe('rare');
    expect(rollRarity(() => 0.829999, CLUB_RARITY_ODDS)).toBe('rare');
    expect(rollRarity(() => 0.830001, CLUB_RARITY_ODDS)).toBe('epic');
    expect(rollRarity(() => 0.959999, CLUB_RARITY_ODDS)).toBe('epic');
    expect(rollRarity(() => 0.960001, CLUB_RARITY_ODDS)).toBe('legend');
  });
});

describe('rollPackRarities (A+)', () => {
  it('returns 1 card when bonus roll does not trigger', () => {
    const seq = [0.1, 0.5]; // rarity -> common, bonus roll 50% >= 10%
    let i = 0;
    const random = () => seq[i++] ?? 0.5;
    expect(rollPackRarities(random, CLUB_RARITY_ODDS, CLUB_BONUS_SECOND_CHANCE)).toEqual(['common']);
  });

  it('returns 2 cards when bonus roll triggers with independent rarity rolls', () => {
    const seq = [0.96, 0.05, 0.2]; // 1st legend, bonus triggers (5% < 10%), 2nd common
    let i = 0;
    const random = () => seq[i++] ?? 0.5;
    expect(rollPackRarities(random, CLUB_RARITY_ODDS, CLUB_BONUS_SECOND_CHANCE)).toEqual(['legend', 'common']);
  });

  it('returns 1 card when bonus chance is 0 (national/default behavior)', () => {
    const seq = [0.1, 0.01];
    let i = 0;
    const random = () => seq[i++] ?? 0.5;
    expect(rollPackRarities(random, NATIONAL_RARITY_ODDS, 0)).toEqual(['common']);
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
