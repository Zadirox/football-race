import { describe, expect, it } from 'vitest';
import { syncWindow } from '@/lib/data/sync-window';

describe('окно синка фикстур', () => {
  it('берёт вчерашний и четыре будущих игровых дня', () => {
    expect(syncWindow(new Date('2026-11-12T10:00:00.000Z'))).toEqual({ from: '2026-11-11', to: '2026-11-16' });
  });

  it('ночной матч относится к предыдущему игровому дню', () => {
    // 01:30 МСК 12 ноября — это ещё игровой день 11 ноября.
    expect(syncWindow(new Date('2026-11-11T22:30:00.000Z'))).toEqual({ from: '2026-11-10', to: '2026-11-15' });
  });

  it('переход через месяц не ломает окно', () => {
    expect(syncWindow(new Date('2026-12-31T12:00:00.000Z'))).toEqual({ from: '2026-12-30', to: '2027-01-04' });
  });
});
