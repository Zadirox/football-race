import { describe, expect, it } from 'vitest';
import { mapMatchdayResultRows, rankMatchdayResults } from '@/lib/repo/matchday-results';

describe('matchday results mapping', () => {
  it('maps rows and preserves counts and die tier', () => {
    const rows = [
      {
        matchday_id: 'md1',
        game_date: '2026-11-13',
        profile_id: 'p1',
        nickname: 'Аня',
        answered: '8',
        correct: 6,
        total: 10,
        bonus_hit: true,
        die_tier: 'silver',
      },
    ];

    expect(mapMatchdayResultRows(rows)).toEqual([
      {
        matchdayId: 'md1',
        gameDate: '2026-11-13',
        profileId: 'p1',
        nickname: 'Аня',
        answered: 8,
        correct: 6,
        total: 10,
        bonusHit: true,
        dieTier: 'silver',
      },
    ]);
  });

  it('normalizes missing values safely', () => {
    const [view] = mapMatchdayResultRows([
      {
        matchday_id: 'md2',
        game_date: '2026-11-14',
        profile_id: 'p2',
        nickname: 'Борис',
        answered: null,
        correct: null,
        total: '0',
        bonus_hit: false,
        die_tier: null,
      },
    ]);

    expect(view).toBeDefined();
    expect(view!.answered).toBe(0);
    expect(view!.correct).toBe(0);
    expect(view!.total).toBe(0);
    expect(view!.bonusHit).toBe(false);
    expect(view!.dieTier).toBeNull();
  });
});

describe('matchday results ranking', () => {
  it('ranks by correct desc then accuracy then answered then nickname', () => {
    const ranked = rankMatchdayResults([
      { matchdayId: 'md', gameDate: '2026-11-13', profileId: 'b', nickname: 'Боря', answered: 10, correct: 7, total: 10, bonusHit: false, dieTier: 'silver' },
      { matchdayId: 'md', gameDate: '2026-11-13', profileId: 'a', nickname: 'Аня', answered: 8, correct: 7, total: 10, bonusHit: false, dieTier: 'silver' },
      { matchdayId: 'md', gameDate: '2026-11-13', profileId: 'c', nickname: 'Вика', answered: 10, correct: 9, total: 10, bonusHit: true, dieTier: 'gold' },
    ]);

    expect(ranked.map((r) => [r.profileId, r.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('leaves rank undefined when there are no resolved questions', () => {
    const ranked = rankMatchdayResults([
      { matchdayId: 'md', gameDate: '2026-11-13', profileId: 'a', nickname: 'Аня', answered: 0, correct: 0, total: 0, bonusHit: false, dieTier: null },
    ]);
    expect(ranked[0]?.rank).toBeUndefined();
  });
});
