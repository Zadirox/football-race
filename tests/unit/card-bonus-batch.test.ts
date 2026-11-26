import { describe, expect, it } from 'vitest';
import { normalizeBatchDecision, shouldCreateCorrectionEntry } from '@/lib/game/card-bonus-batch';

describe('card bonus batch', () => {
  it('marks visible selected as awarded and visible unselected as not awarded', () => {
    expect(normalizeBatchDecision({ visibleSlotIds: ['a', 'b', 'c'], selectedSlotIds: ['b'] }))
      .toEqual({ a: false, b: true, c: false });
  });

  it('creates correction entry when awarded state changes', () => {
    expect(shouldCreateCorrectionEntry({ awarded: true, points: 20 }, { awarded: false, points: 0 })).toBe(true);
    expect(shouldCreateCorrectionEntry({ awarded: true, points: 20 }, { awarded: true, points: 20 })).toBe(false);
  });
});
