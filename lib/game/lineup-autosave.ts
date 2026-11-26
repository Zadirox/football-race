export type LineupAutosaveState = 'idle' | 'saving' | 'saved' | 'error';

export type LineupSlotKey = string; // `${matchId}:${slot}`

export function makeLineupSlotKey(matchId: string, slot: string): LineupSlotKey {
  return `${matchId}:${slot}`;
}

export function shouldApplySaveResult(input: { requestId: number; latestRequestId: number }): boolean {
  return input.requestId === input.latestRequestId;
}

export type PendingSave = {
  requestId: number;
  desiredCardId: string | null; // null = remove
};

export class SlotSaveQueue {
  private latestRequestId = 0;
  private inflight: Promise<void> | null = null;
  private queued: PendingSave | null = null;

  enqueue(desiredCardId: string | null): PendingSave {
    const requestId = ++this.latestRequestId;
    const save = { requestId, desiredCardId };
    this.queued = save;
    return save;
  }

  getLatestRequestId(): number {
    return this.latestRequestId;
  }

  takeQueued(): PendingSave | null {
    const q = this.queued;
    this.queued = null;
    return q;
  }

  hasQueued(): boolean {
    return this.queued !== null;
  }

  setInflight(p: Promise<void> | null) {
    this.inflight = p;
  }

  getInflight(): Promise<void> | null {
    return this.inflight;
  }
}
