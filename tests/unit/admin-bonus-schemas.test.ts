import { describe, expect, it } from 'vitest';
import { lineupBonusBatchSubmitSchema } from '@/lib/actions/admin-schemas';

describe('lineupBonusBatchSubmitSchema', () => {
  it('accepts visible and selected slot ids', () => {
    const r = lineupBonusBatchSubmitSchema.safeParse({
      visibleSlotIds: ['11111111-1111-4111-8111-111111111111'],
      selectedAwardedSlotIds: [],
      filterDay: '2026-11-25',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid uuid and bad day', () => {
    const badUuid = lineupBonusBatchSubmitSchema.safeParse({ visibleSlotIds: ['bad'], selectedAwardedSlotIds: [] });
    expect(badUuid.success).toBe(false);
    const badDay = lineupBonusBatchSubmitSchema.safeParse({
      visibleSlotIds: ['11111111-1111-4111-8111-111111111111'],
      selectedAwardedSlotIds: [],
      filterDay: '25-11-2026',
    });
    expect(badDay.success).toBe(false);
  });
});
