import { describe, expect, it } from 'vitest';
import { normalizeCardBonusReportItemsForPlayer } from '@/lib/repo/card-bonus-reports';

describe('card bonus report player history', () => {
  it('includes awarded items and excludes no-points items', () => {
    const items = normalizeCardBonusReportItemsForPlayer([
      { awarded: true, points: 20, lineupSlotId: 'a' },
      { awarded: false, points: 0, lineupSlotId: 'b' },
      { awarded: true, points: 10, lineupSlotId: 'c' },
    ] as any);
    expect(items.map((i: any) => i.lineupSlotId)).toEqual(['a', 'c']);
  });
});
