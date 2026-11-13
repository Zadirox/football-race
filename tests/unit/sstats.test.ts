import { describe, expect, it } from 'vitest';
import { fetchSstatsUnlFixtures, mapSstatsStatus, normalizeSstatsUnlGame } from '@/lib/data/sstats';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('статусы sstats', () => {
  it('распознаёт основные статусы', () => {
    expect(mapSstatsStatus('Not Started')).toBe('NS');
    expect(mapSstatsStatus('Finished')).toBe('FT');
    expect(mapSstatsStatus('Full Time')).toBe('FT');
    expect(mapSstatsStatus('Live')).toBe('LIVE');
    expect(mapSstatsStatus('1st Half')).toBe('LIVE');
    expect(mapSstatsStatus('Halftime')).toBe('HT');
    expect(mapSstatsStatus('Postponed')).toBe('PST');
    expect(mapSstatsStatus('Cancelled')).toBe('CANC');
  });
});

describe('normalizeSstatsUnlGame', () => {
  it('собирает матч Лиги наций', () => {
    const match = normalizeSstatsUnlGame({
      id: 123,
      dateUtc: '2026-11-12 19:45:00',
      statusName: 'Not Started',
      homeTeam: { name: 'Portugal', shortName: 'Portugal' },
      awayTeam: { name: 'Spain', shortName: 'Spain' },
      homeResult: null,
      awayResult: null,
      htResult: { home: null, away: null },
    });

    expect(match).not.toBeNull();
    expect(match?.provider).toBe('sstats');
    expect(match?.externalId).toBe('123');
    expect(match?.leagueCode).toBe('UNL');
    expect(match?.homeName).toBe('Portugal');
    expect(match?.awayName).toBe('Spain');
    expect(match?.status).toBe('NS');
    expect(match?.kickoffUtc.toISOString()).toBe('2026-11-12T19:45:00.000Z');
  });

  it('берёт счёт', () => {
    const match = normalizeSstatsUnlGame({
      id: 124,
      dateUtc: '2026-11-12 19:45:00',
      statusName: 'Finished',
      homeTeam: { name: 'Portugal' },
      awayTeam: { name: 'Spain' },
      homeResult: 2,
      awayResult: 1,
      htResult: { home: 1, away: 0 },
    });

    expect(match?.status).toBe('FT');
    expect(match?.homeScore).toBe(2);
    expect(match?.awayScore).toBe(1);
    expect(match?.htHomeScore).toBe(1);
  });

  it('не падает на необычных полях', () => {
    const match = normalizeSstatsUnlGame({
      id: 125,
      dateUtc: 1794528000000 as any, // число (мс) вместо строки
      statusName: { name: 'Not Started' } as any,
      homeTeam: 'Portugal' as any,
      awayTeam: { title: 'Spain' } as any,
      homeResult: '1' as any,
      awayResult: '0' as any,
      htResult: { home: '1', away: '0' } as any,
    } as any);

    expect(match).not.toBeNull();
    expect(match?.homeName).toBe('Portugal');
    expect(match?.awayName).toBe('Spain');
    expect(match?.homeScore).toBe(1);
  });
});

describe('fetchSstatsUnlFixtures', () => {
  it('запрашивает период и возвращает матчи', async () => {
    const calls: Array<[URL, RequestInit | undefined]> = [];
    const fetchImpl = async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push([new URL(String(url)), init]);
      return jsonResponse([
        {
          id: 1,
          dateUtc: '2026-11-13 19:45:00',
          statusName: 'Not Started',
          homeTeam: { name: 'France' },
          awayTeam: { name: 'Germany' },
        },
      ]);
    };

    const result = await fetchSstatsUnlFixtures({
      from: '2026-11-12',
      to: '2026-11-17',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.fetched).toBe(1);
    const [url] = calls[0]!;
    expect(url.searchParams.get('LeagueId')).toBe('5');
    expect(url.searchParams.get('Year')).toBe('2026');
    expect(url.searchParams.get('From')).toBe('2026-11-12');
    expect(url.searchParams.get('To')).toBe('2026-11-17');
  });
});
