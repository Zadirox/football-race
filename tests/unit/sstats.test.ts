import { describe, expect, it } from 'vitest';
import {
  extractSstatsMatchStats,
  fetchSstatsUnlFixtures,
  mapSstatsStatus,
  normalizeSstatsUnlGame,
} from '@/lib/data/sstats';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('статусы sstats', () => {
  it('распознаёт текстовые статусы', () => {
    expect(mapSstatsStatus('Not Started')).toBe('NS');
    expect(mapSstatsStatus('Finished')).toBe('FT');
    expect(mapSstatsStatus('Full Time')).toBe('FT');
    expect(mapSstatsStatus('Live')).toBe('LIVE');
    expect(mapSstatsStatus('1st Half')).toBe('LIVE');
    expect(mapSstatsStatus('Halftime')).toBe('HT');
    expect(mapSstatsStatus('Postponed')).toBe('PST');
    expect(mapSstatsStatus('Cancelled')).toBe('CANC');
  });

  it('распознаёт числовые коды API', () => {
    expect(mapSstatsStatus(1)).toBe('NS');
    expect(mapSstatsStatus(2)).toBe('NS');
    expect(mapSstatsStatus(3)).toBe('LIVE'); // 1st half
    expect(mapSstatsStatus(4)).toBe('HT');
    expect(mapSstatsStatus(5)).toBe('LIVE'); // 2nd half
    expect(mapSstatsStatus(8)).toBe('FT');
    expect(mapSstatsStatus(10)).toBe('FT');
    expect(mapSstatsStatus(12)).toBe('ABD');
    expect(mapSstatsStatus(13)).toBe('ABD');
    expect(mapSstatsStatus(14)).toBe('PST');
    expect(mapSstatsStatus(15)).toBe('CANC');
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
    expect(match?.homeName).toBe('Португалия');
    expect(match?.awayName).toBe('Испания');
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

  it('поддерживает реальные поля API (числовой статус, homeHTResult, elapsed)', () => {
    const match = normalizeSstatsUnlGame({
      id: 1545601,
      date: '2026-09-24T19:00:00+03:00',
      dateUtc: 1790265600,
      status: 8,
      statusName: 'Finished',
      elapsed: 90,
      homeTeam: { name: 'Andorra' },
      awayTeam: { name: 'Malta' },
      homeResult: 1,
      awayResult: 2,
      homeHTResult: 1,
      awayHTResult: 1,
      homeFTResult: 1,
      awayFTResult: 2,
    } as any);

    expect(match).not.toBeNull();
    expect(match?.status).toBe('FT');
    expect(match?.homeScore).toBe(1);
    expect(match?.awayScore).toBe(2);
    expect(match?.htHomeScore).toBe(1);
    expect(match?.htAwayScore).toBe(1);
    expect(match?.minute).toBe(90);
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
    expect(match?.homeName).toBe('Португалия');
    expect(match?.awayName).toBe('Испания');
    expect(match?.homeScore).toBe(1);
  });
});

describe('extractSstatsMatchStats', () => {
  it('извлекает статистику из ответа /games/{id} (data.statistics, shotsOnGoal)', () => {
    const stats = extractSstatsMatchStats({
      status: 'OK',
      data: {
        game: { id: 1 },
        statistics: {
          cornerKicksHome: 3,
          cornerKicksAway: 2,
          yellowCardsHome: 5,
          yellowCardsAway: 2,
          redCardsHome: null,
          redCardsAway: 0,
          ballPossessionHome: 41,
          ballPossessionAway: 59,
          shotsOnGoalHome: 5,
          shotsOnGoalAway: 8,
        },
      },
    });
    expect(stats.cornersHome).toBe(3);
    expect(stats.cornersAway).toBe(2);
    expect(stats.yellowCardsHome).toBe(5);
    expect(stats.possessionHome).toBe(41);
    expect(stats.shotsOnTargetHome).toBe(5);
    expect(stats.shotsOnTargetAway).toBe(8);
  });
});

describe('fetchSstatsUnlFixtures', () => {
  it('запрашивает период (To эксклюзивно для date-only), apikey и возвращает матчи из envelope', async () => {
    const calls: Array<[URL, RequestInit | undefined]> = [];
    const fetchImpl = async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push([new URL(String(url)), init]);
      return jsonResponse({
        status: 'OK',
        count: 1,
        data: [
          {
            id: 1,
            dateUtc: '2026-11-13 19:45:00',
            status: 2,
            statusName: 'Not started',
            homeTeam: { name: 'France' },
            awayTeam: { name: 'Germany' },
          },
        ],
      });
    };

    const result = await fetchSstatsUnlFixtures({
      from: '2026-11-12',
      to: '2026-11-17',
      apiKey: 'k123',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.matches).toHaveLength(1);
    expect(result.fetched).toBe(1);
    expect(result.matches[0]?.status).toBe('NS');
    const [url] = calls[0]!;
    expect(url.searchParams.get('LeagueId')).toBe('5');
    expect(url.searchParams.get('Year')).toBe('2026');
    expect(url.searchParams.get('From')).toBe('2026-11-12');
    expect(url.searchParams.get('To')).toBe('2026-11-18'); // date-only To эксклюзивно в API
    expect(url.searchParams.get('TimeZone')).toBe('3');
    expect(url.searchParams.get('apikey')).toBe('k123');
  });
});
