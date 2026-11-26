import { LINEUP_POINTS, type CardRarity } from '@/lib/game/cards';

export function normalizeBatchDecision(input: {
  visibleSlotIds: readonly string[];
  selectedSlotIds: readonly string[];
}): Record<string, boolean> {
  const selected = new Set(input.selectedSlotIds);
  const out: Record<string, boolean> = {};
  for (const slotId of input.visibleSlotIds) {
    out[slotId] = selected.has(slotId);
  }
  return out;
}

export function computeBonusPoints(rarity: CardRarity): number {
  return LINEUP_POINTS[rarity] ?? 0;
}

export function shouldCreateCorrectionEntry(
  before: { awarded: boolean; points: number } | null | undefined,
  after: { awarded: boolean; points: number },
): boolean {
  if (!before) return false;
  return before.awarded !== after.awarded || before.points !== after.points;
}

export function groupReportItemsByProfile<T extends { profileId: string }>(items: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const arr = map.get(item.profileId) ?? [];
    arr.push(item);
    map.set(item.profileId, arr);
  }
  return map;
}
