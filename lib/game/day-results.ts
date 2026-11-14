import { DICE_TIER_LABEL, type DiceTier } from '@/lib/game/dice';

export function dayResultDieLabel(tier: DiceTier | null | undefined): string | null {
  if (!tier) return null;
  return DICE_TIER_LABEL[tier] ?? null;
}

export function shouldShowDaySummary(
  matchdayId: string | null | undefined,
  dismissedMatchdayId: string | null | undefined,
): boolean {
  if (!matchdayId) return false;
  return matchdayId !== dismissedMatchdayId;
}

export function dayResultsSeenKey(seasonId: string, profileId: string): string {
  return `fr.dayResultsSeen.${seasonId}.${profileId}`;
}

export function formatDayAccuracy(correct: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((correct / total) * 100)}%`;
}
