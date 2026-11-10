import { describe, expect, it } from 'vitest';
import {
  displayTeamName,
  isFinalStatus,
  mapStatus,
  matchesInWindow,
  normalizeMatch,
  normalizeMatches,
  pickDayMatches,
  type ProviderMatch,
} from '@/lib/data/normalize';
import { isAllowedMatch, leagueByProviderCode } from '@/lib/data/leagues';

function providerMatch(overrides: Partial<ProviderMatch> = {}): ProviderMatch {
  return {
    id: 1001,
    utcDate: '2026-11-12T20:00:00Z',
    status: 'SCHEDULED',
    competition: { code: 'PL', name: 'Premier League' },
    homeTeam: { name: 'Arsenal FC', shortName: 'Arsenal', crest: 'https://crest/ars.png' },
    awayTeam: { name: 'Chelsea FC', shortName: 'Chelsea', crest: 'https://crest/che.png' },
    score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    ...overrides,
  };
}

describe('статусы', () => {
  it('переводит статусы провайдера', () => {
    expect(mapStatus('SCHEDULED')).toBe('NS');
    expect(mapStatus('TIMED')).toBe('NS');
    expect(mapStatus('IN_PLAY')).toBe('LIVE');
    expect(mapStatus('PAUSED')).toBe('HT');
    expect(mapStatus('FINISHED')).toBe('FT');
    expect(mapStatus('POSTPONED')).toBe('PST');
    expect(mapStatus('CANCELLED')).toBe('CANC');
    expect(mapStatus('SUSPENDED')).toBe('ABD');
    expect(mapStatus('WHAT')).toBe('NS');
  });

  it('финальные статусы', () => {
    expect(isFinalStatus('FT')).toBe(true);
    expect(isFinalStatus('PST')).toBe(true);
    expect(isFinalStatus('LIVE')).toBe(false);
  });
});

describe('лиги', () => {
  it('знает разрешённые коды', () => {
    expect(leagueByProviderCode('PL')?.code).toBe('PL');
    expect(leagueByProviderCode('PD')?.code).toBe('PD');
    expect(leagueByProviderCode('RPL')).toBeNull();
  });

  it('отбрасывает РПЛ и ноунейм-дивизионы', () => {
    expect(
      isAllowedMatch({ competitionCode: 'RPL', homeName: 'Зенит', awayName: 'Спартак' }),
    ).toBe(false);
    expect(
      isAllowedMatch({ competitionCode: 'BL2', homeName: 'Гамбург', awayName: 'Кёльн' }),
    ).toBe(false);
  });

  it('пропускает товарищеские только с топ-сборной', () => {
    expect(isAllowedMatch({ competitionCode: 'FR', homeName: 'France', awayName: 'Chile' })).toBe(true);
    expect(isAllowedMatch({ competitionCode: 'FR', homeName: 'Malta', awayName: 'Andorra' })).toBe(false);
  });
});

describe('normalizeMatch', () => {
  it('собирает матч', () => {
    const match = normalizeMatch(providerMatch());
    expect(match).not.toBeNull();
    expect(match?.leagueCode).toBe('PL');
    expect(match?.homeName).toBe('Arsenal');
    expect(match?.awayName).toBe('Chelsea');
    expect(match?.status).toBe('NS');
    expect(match?.kickoffUtc.toISOString()).toBe('2026-11-12T20:00:00.000Z');
  });

  it('берёт счёт и первый тайм', () => {
    const match = normalizeMatch(
      providerMatch({
        status: 'FINISHED',
        score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
      }),
    );
    expect(match?.homeScore).toBe(2);
    expect(match?.awayScore).toBe(1);
    expect(match?.htHomeScore).toBe(1);
    expect(match?.status).toBe('FT');
  });

  it('возвращает null для турнира вне списка', () => {
    expect(normalizeMatch(providerMatch({ competition: { code: 'RPL' } }))).toBeNull();
  });

  it('возвращает null для битой даты', () => {
    expect(normalizeMatch(providerMatch({ utcDate: 'не дата' }))).toBeNull();
  });

  it('чистит суффиксы, если нет shortName', () => {
    expect(displayTeamName({ name: 'Liverpool FC' }, 'X')).toBe('Liverpool');
    expect(displayTeamName({ name: 'Real Madrid CF' }, 'X')).toBe('Real Madrid');
    expect(displayTeamName({ name: null }, 'Гости')).toBe('Гости');
  });
});

describe('normalizeMatches', () => {
  it('фильтрует и сортирует по времени', () => {
    const list = normalizeMatches([
      providerMatch({ id: 2, utcDate: '2026-11-12T22:00:00Z' }),
      providerMatch({ id: 1, utcDate: '2026-11-12T18:00:00Z' }),
      providerMatch({ id: 3, competition: { code: 'RPL' } }),
    ]);
    expect(list.map((m) => m.externalId)).toEqual(['1', '2']);
  });
});

describe('окно дня и выбор матчей', () => {
  const matches = normalizeMatches([
    providerMatch({ id: 1, competition: { code: 'FR' }, homeTeam: { name: 'Malta' }, awayTeam: { name: 'Andorra' } }),
    providerMatch({ id: 2, competition: { code: 'FL1' } }),
    providerMatch({ id: 3, competition: { code: 'CL' } }),
    providerMatch({ id: 4, utcDate: '2026-11-13T02:00:00Z', competition: { code: 'PD' } }),
  ]);

  it('матч 02:00 попадает в окно предыдущего дня', () => {
    const opensAt = new Date('2026-11-12T06:00:00Z');
    const closesAt = new Date('2026-11-13T05:59:59.999Z');
    expect(matchesInWindow(matches, opensAt, closesAt).map((m) => m.externalId)).toEqual(['2', '3', '4']);
  });

  it('приоритет у ЛЧ, дальше топ-лиги', () => {
    expect(pickDayMatches(matches, 3).map((m) => m.externalId)).toEqual(['3', '4', '2']);
  });
});
