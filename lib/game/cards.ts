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

export function isOutfield(role: RoleGroup): boolean {
  return role !== 'GK';
}

export function canSlotCard(params: { slot: LineupSlotKind; roleGroup: RoleGroup }): boolean {
  const { slot, roleGroup } = params;
  if (slot === 'GK') return roleGroup === 'GK';
  return isOutfield(roleGroup);
}
