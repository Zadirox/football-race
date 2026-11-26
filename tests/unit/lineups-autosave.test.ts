import { describe, expect, it } from 'vitest';
import { shouldApplySaveResult, SlotSaveQueue, makeLineupSlotKey } from '@/lib/game/lineup-autosave';

describe('lineup autosave', () => {
  it('builds stable slot key', () => {
    expect(makeLineupSlotKey('m1', 'GK')).toBe('m1:GK');
  });

  it('ignores stale save result when newer request exists', () => {
    expect(shouldApplySaveResult({ requestId: 1, latestRequestId: 2 })).toBe(false);
    expect(shouldApplySaveResult({ requestId: 2, latestRequestId: 2 })).toBe(true);
  });

  it('queue keeps latest desired value', () => {
    const q = new SlotSaveQueue();
    q.enqueue('a');
    q.enqueue('b');
    expect(q.getLatestRequestId()).toBe(2);
    expect(q.takeQueued()?.desiredCardId).toBe('b');
    expect(q.takeQueued()).toBeNull();
  });
});
