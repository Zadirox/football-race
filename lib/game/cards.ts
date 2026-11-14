/**
 * National cards MVP: rarity odds, lineup points, matchday packs, and slot helpers.
 */
import type { DiceTier } from '@/lib/game/dice';

export type CardRarity = 'common' | 'rare' | 'epic' | 'legend';
export type RoleGroup = 'GK' | 'DEF' | 'MID' | 'FWD';
export type LineupSlotKind = 'GK' | 'OF1' | 'OF2';

export const CARD_RARITY_ODDS = {
  common: 70,
  rare: 22,
  epic: 7,
  legend: 1,
} as const;

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

export function rollRarity(random: () => number): CardRarity {
  const roll = random() * 100;
  if (roll < CARD_RARITY_ODDS.common) return 'common';
  if (roll < CARD_RARITY_ODDS.common + CARD_RARITY_ODDS.rare) return 'rare';
  if (roll < CARD_RARITY_ODDS.common + CARD_RARITY_ODDS.rare + CARD_RARITY_ODDS.epic) {
    return 'epic';
  }
  return 'legend';
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
