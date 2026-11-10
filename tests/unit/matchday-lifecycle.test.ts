import { describe, expect, it } from 'vitest';
import {
  allMatchesFinal,
  nextMatchdayStatus,
  RESOLVE_GRACE_MS,
  type DayMatch,
} from '@/lib/game/matchday-lifecycle';

const HOUR = 3_600_000;
const now = Date.parse('2026-11-12T18:00:00.000Z');
const closesAt = now + 2 * HOUR;

function match(status: DayMatch['status'], hoursFromNow: number): DayMatch {
  return { status, kickoffMs: now + hoursFromNow * HOUR };
}

describe('статусы игрового дня', () => {
  it('до первого матча день запланирован', () => {
    expect(nextMatchdayStatus({ current: 'scheduled', matches: [match('NS', 2)], nowMs: now, closesAtMs: closesAt })).toBe(
      'scheduled',
    );
  });

  it('со стартом первого матча день блокируется', () => {
    expect(nextMatchdayStatus({ current: 'scheduled', matches: [match('LIVE', -0.5)], nowMs: now, closesAtMs: closesAt })).toBe(
      'live',
    );
    expect(nextMatchdayStatus({ current: 'scheduled', matches: [match('NS', -0.5)], nowMs: now, closesAtMs: closesAt })).toBe(
      'locked',
    );
  });

  it('живой матч переводит день в live', () => {
    expect(nextMatchdayStatus({ current: 'locked', matches: [match('LIVE', -0.5)], nowMs: now, closesAtMs: closesAt })).toBe(
      'live',
    );
    expect(nextMatchdayStatus({ current: 'locked', matches: [match('HT', -0.2)], nowMs: now, closesAtMs: closesAt })).toBe(
      'live',
    );
  });

  it('все финальные статусы переводят день в resolving', () => {
    expect(
      nextMatchdayStatus({
        current: 'live',
        matches: [match('FT', -3), match('PST', -1), match('CANC', 1)],
        nowMs: now,
        closesAtMs: closesAt,
      }),
    ).toBe('resolving');
  });

  it('один незавершённый матч не даёт резолвить день', () => {
    expect(
      nextMatchdayStatus({
        current: 'live',
        matches: [match('FT', -3), match('NS', 1)],
        nowMs: now,
        closesAtMs: closesAt,
      }),
    ).toBe('live');
  });

  it('через три часа после окна день закрывается страховкой', () => {
    expect(
      nextMatchdayStatus({
        current: 'live',
        matches: [match('NS', -4)],
        nowMs: closesAt + RESOLVE_GRACE_MS + 1,
        closesAtMs: closesAt,
      }),
    ).toBe('resolving');
  });

  it('ровно на границе страховки день ещё ждёт данные', () => {
    expect(
      nextMatchdayStatus({
        current: 'live',
        matches: [match('NS', -4)],
        nowMs: closesAt + RESOLVE_GRACE_MS,
        closesAtMs: closesAt,
      }),
    ).toBe('live');
  });

  it('закрытый день не переоткрывается', () => {
    expect(
      nextMatchdayStatus({ current: 'closed', matches: [match('LIVE', -1)], nowMs: now, closesAtMs: closesAt }),
    ).toBe('closed');
  });

  it('день без матчей дожидается окна и закрывается страховкой', () => {
    expect(nextMatchdayStatus({ current: 'scheduled', matches: [], nowMs: now, closesAtMs: closesAt })).toBe('scheduled');
    expect(
      nextMatchdayStatus({
        current: 'scheduled',
        matches: [],
        nowMs: closesAt + RESOLVE_GRACE_MS + 1,
        closesAtMs: closesAt,
      }),
    ).toBe('resolving');
  });

  it('allMatchesFinal требует хотя бы один матч', () => {
    expect(allMatchesFinal([])).toBe(false);
    expect(allMatchesFinal([match('FT', 0), match('ABD', 0)])).toBe(true);
  });
});
