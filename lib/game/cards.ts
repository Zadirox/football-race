/**
 * Cards: rarity odds, lineup points, matchday packs, and slot helpers.
 * Supports national (legacy default) and club pack odds/bonus rules.
 */
import type { DiceTier } from '@/lib/game/dice';

export type CardRarity = 'common' | 'rare' | 'epic' | 'legend';
export type RoleGroup = 'GK' | 'DEF' | 'MID' | 'FWD';
export type LineupSlotKind = 'GK' | 'OF1' | 'OF2';

export type RarityOdds = Readonly<Record<CardRarity, number>>;

/** National cards MVP odds (default). */
export const NATIONAL_RARITY_ODDS: RarityOdds = {
  common: 70,
  rare: 22,
  epic: 7,
  legend: 1,
};

/** Club cards odds (2C.4, Variant C). */
export const CLUB_RARITY_ODDS: RarityOdds = {
  common: 55,
  rare: 28,
  epic: 13,
  legend: 4,
};

/** Club pack A+: chance (percent) of a second card roll. */
export const CLUB_BONUS_SECOND_CHANCE = 10;

/** Backward-compatible alias (national odds). */
export const CARD_RARITY_ODDS = NATIONAL_RARITY_ODDS;

export const LINEUP_POINTS = {
  common: 10,
  rare: 20,
  epic: 30,
  legend: 40,
} as const;

const RARITY_FALLBACK_ORDER: readonly CardRarity[] = ['common', 'rare', 'epic', 'legend'];

export function matchdayPackCount(tier: DiceTier | null): number {
  return tier === 'gold' ? 2 : 1;
}

export function rollRarity(random: () => number, odds: RarityOdds = NATIONAL_RARITY_ODDS): CardRarity {
  const roll = random() * 100;
  if (roll < odds.common) return 'common';
  if (roll < odds.common + odds.rare) return 'rare';
  if (roll < odds.common + odds.rare + odds.epic) {
    return 'epic';
  }
  return 'legend';
}

/**
 * Rolls rarities for a pack open: 1 guaranteed card, plus a second card with
 * `bonusSecondChancePercent` probability (independent roll, same odds).
 */
export function rollPackRarities(
  random: () => number,
  odds: RarityOdds = NATIONAL_RARITY_ODDS,
  bonusSecondChancePercent = 0,
): CardRarity[] {
  const rarities: CardRarity[] = [rollRarity(random, odds)];
  if (bonusSecondChancePercent > 0 && random() * 100 < bonusSecondChancePercent) {
    rarities.push(rollRarity(random, odds));
  }
  return rarities;
}

export function hasCollectibleLeft(total: number, owned: number): boolean {
  return total - owned > 0;
}

export function pickCardTemplate<T extends { rarity: CardRarity }>(
  available: readonly T[],
  rolled: CardRarity,
  random: () => number,
): T | null {
  if (available.length === 0) return null;

  const buckets = new Map<CardRarity, T[]>();
  for (const rarity of RARITY_FALLBACK_ORDER) buckets.set(rarity, []);
  for (const template of available) {
    const bucket = buckets.get(template.rarity);
    if (bucket) bucket.push(template);
  }

  const pickFrom = (bucket: readonly T[]): T | null => {
    if (bucket.length === 0) return null;
    const index = Math.min(Math.floor(random() * bucket.length), bucket.length - 1);
    return bucket[index] ?? null;
  };

  const rolledBucket = buckets.get(rolled) ?? [];
  if (rolledBucket.length > 0) return pickFrom(rolledBucket);

  for (const rarity of RARITY_FALLBACK_ORDER) {
    const bucket = buckets.get(rarity) ?? [];
    if (bucket.length > 0) return pickFrom(bucket);
  }

  return null;
}

export function isOutfield(role: RoleGroup): boolean {
  return role !== 'GK';
}

export function canSlotCard(params: { slot: LineupSlotKind; roleGroup: RoleGroup }): boolean {
  const { slot, roleGroup } = params;
  if (slot === 'GK') return roleGroup === 'GK';
  return isOutfield(roleGroup);
}

export function defBonusTriggered({ teamGoals, oppGoals }: { teamGoals: number; oppGoals: number }): boolean {
  return teamGoals - oppGoals >= 2;
}
