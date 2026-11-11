import { describe, expect, it } from 'vitest';
import { diceGrantSchema, matchUpdateSchema, roleChangeSchema } from '@/lib/actions/admin-schemas';

const ID = '00000000-0000-4000-8000-000000000001';

describe('admin schemas', () => {
  it('принимает корректную правку матча', () => {
    expect(
      matchUpdateSchema.safeParse({ matchId: ID, status: 'FT', homeScore: 2, awayScore: 1, minute: null }).success,
    ).toBe(true);
  });

  it('отклоняет отрицательный счёт и неизвестный статус', () => {
    expect(
      matchUpdateSchema.safeParse({ matchId: ID, status: 'XX', homeScore: -1, awayScore: 0, minute: null }).success,
    ).toBe(false);
  });

  it('ограничивает выдачу кубиков', () => {
    expect(diceGrantSchema.safeParse({ profileId: ID, tier: 'gold', count: 3, reason: 'бонус' }).success).toBe(true);
    expect(diceGrantSchema.safeParse({ profileId: ID, tier: 'gold', count: 0, reason: 'бонус' }).success).toBe(false);
    expect(diceGrantSchema.safeParse({ profileId: ID, tier: 'gold', count: 11, reason: 'бонус' }).success).toBe(false);
  });

  it('знает только три роли', () => {
    expect(roleChangeSchema.safeParse({ profileId: ID, role: 'spectator' }).success).toBe(true);
    expect(roleChangeSchema.safeParse({ profileId: ID, role: 'owner' }).success).toBe(false);
  });
});
