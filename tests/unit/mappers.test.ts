import { describe, expect, it } from 'vitest';
import {
  parseDistribution,
  parseOptions,
  toActivityViews,
  toMeView,
  toPendingChoice,
  toPlayerViews,
  toQuestionView,
  toRatingsSeed,
  toSeasonView,
  toMatchView,
  type ActivityRow,
  type EffectRow,
  type MatchRow,
  type PendingRow,
  type PlayerRow,
  type QuestionRow,
} from '@/lib/repo/mappers';

const PLAYER: PlayerRow = {
  profile_id: 'p-1',
  nickname: 'Шах',
  avatar_url: null,
  role: 'admin',
  position: '17',
  finished_at: null,
  points: '320',
  answered: '46',
  correct: 29,
  last_action: 'Ответил на вопрос про тотал',
  dice_wood: '0',
  dice_bronze: 2,
  dice_silver: '1',
  dice_gold: null,
};

const PLAYER_TWO: PlayerRow = {
  ...PLAYER,
  profile_id: 'p-2',
  nickname: 'Аня',
  role: 'player',
  position: 80,
  finished_at: new Date('2026-11-12T20:00:00.000Z'),
  points: 400,
  answered: 50,
  correct: 40,
  last_action: null,
  dice_wood: 1,
  dice_bronze: 0,
  dice_silver: 0,
  dice_gold: 0,
};

describe('маппинг сезона', () => {
  it('календарные даты остаются как есть', () => {
    const view = toSeasonView({
      id: 's-1',
      slug: 'winter-2026',
      title: 'Зимний сезон 2026',
      status: 'active',
      starts_on: '2026-11-12',
      ends_on: '2027-03-01',
    });
    expect(view).toEqual({
      id: 's-1',
      slug: 'winter-2026',
      title: 'Зимний сезон 2026',
      status: 'active',
      startsOn: '2026-11-12',
      endsOn: '2027-03-01',
    });
  });
});

describe('маппинг игроков', () => {
  const effects: EffectRow[] = [
    { profile_id: 'p-1', code: 'tribuny', charges: '1' },
    { profile_id: 'p-1', code: 'неизвестный', charges: 5 },
    { profile_id: 'p-1', code: 'gazon', charges: 0 },
    { profile_id: 'p-2', code: 'tactics', charges: 2 },
  ];

  it('приводит числовые агрегаты из строк и считает кубики', () => {
    const me = toPlayerViews([PLAYER], effects, 'p-1')[0]!;
    expect(me.position).toBe(17);
    expect(me.points).toBe(320);
    expect(me.answered).toBe(46);
    expect(me.correct).toBe(29);
    expect(me.dice).toEqual({ wood: 0, bronze: 2, silver: 1, gold: 0 });
    expect(me.isMe).toBe(true);
  });

  it('оставляет только известные эффекты с положительным зарядом', () => {
    const players = toPlayerViews([PLAYER, PLAYER_TWO], effects, 'p-1');
    expect(players[0]!.effects).toEqual([{ code: 'tribuny', charges: 1 }]);
    expect(players[1]!.effects).toEqual([{ code: 'tactics', charges: 2 }]);
  });

  it('нормализует дату финиша в ISO', () => {
    const players = toPlayerViews([PLAYER, PLAYER_TWO], effects, null);
    expect(players[1]!.finishedAt).toBe('2026-11-12T20:00:00.000Z');
    expect(players[1]!.isMe).toBe(false);
  });

  it('рейтинговый срез повторяет игроков', () => {
    const players = toPlayerViews([PLAYER, PLAYER_TWO], [], 'p-1');
    expect(toRatingsSeed(players)[1]!).toEqual({
      profileId: 'p-2',
      nickname: 'Аня',
      position: 80,
      finishedAt: '2026-11-12T20:00:00.000Z',
      points: 400,
      answered: 50,
      correct: 40,
    });
  });
});

describe('маппинг матча', () => {
  it('переносит счёт, статус и прогресс ответов', () => {
    const row: MatchRow = {
      id: 'm-1',
      league_code: 'UNL',
      league_title: 'Лига наций',
      home_name: 'Сербия',
      home_logo: null,
      away_name: 'Швейцария',
      away_logo: 'https://example.com/ch.png',
      kickoff_utc: new Date('2026-11-12T17:00:00.000Z'),
      status: 'LIVE',
      minute: 63,
      home_score: '1',
      away_score: 2,
      in_scope: true,
      question_count: '4',
      my_answered: 1,
    };

    expect(toMatchView(row)).toEqual({
      id: 'm-1',
      leagueCode: 'UNL',
      leagueTitle: 'Лига наций',
      homeName: 'Сербия',
      homeLogo: null,
      awayName: 'Швейцария',
      awayLogo: 'https://example.com/ch.png',
      kickoffUtc: '2026-11-12T17:00:00.000Z',
      status: 'LIVE',
      minute: 63,
      homeScore: 1,
      awayScore: 2,
      questionCount: 4,
      myAnswered: 1,
      inPredictions: true,
    });
  });

  it('сохраняет null до старта матча', () => {
    const view = toMatchView({
      id: 'm-2',
      league_code: 'UNL',
      league_title: 'Лига наций',
      home_name: 'Испания',
      home_logo: null,
      away_name: 'Нидерланды',
      away_logo: null,
      kickoff_utc: '2026-11-12T19:45:00.000Z',
      status: 'NS',
      minute: null,
      home_score: null,
      away_score: null,
      in_scope: true,
      question_count: 4,
      my_answered: 0,
    });

    expect(view.minute).toBeNull();
    expect(view.homeScore).toBeNull();
    expect(view.awayScore).toBeNull();
    expect(view.kickoffUtc).toBe('2026-11-12T19:45:00.000Z');
  });
});

describe('маппинг вопросов', () => {
  const base: QuestionRow = {
    id: 'q-1',
    match_id: 'm-1',
    kind: 'choice',
    prompt: 'Кто победит?',
    options: [
      { key: 'home', label: 'Хозяева' },
      { key: 'draw', label: 'Ничья', extra: 'игнорируется' },
    ],
    is_bonus: false,
    locks_at: new Date('2026-11-12T17:00:00.000Z'),
    status: 'open',
    correct_option: 'home',
    my_choice: 'draw',
    distribution: { home: '3', draw: 2 },
  };

  it('на открытом вопросе прячет правильный ответ и распределение', () => {
    const view = toQuestionView(base);
    expect(view.locksAt).toBe('2026-11-12T17:00:00.000Z');
    expect(view.correctOption).toBeNull();
    expect(view.distribution).toBeNull();
    expect(view.myChoice).toBe('draw');
    expect(view.options).toEqual([
      { key: 'home', label: 'Хозяева' },
      { key: 'draw', label: 'Ничья' },
    ]);
  });

  it('на резолвнутом вопросе отдаёт правильный ответ и распределение', () => {
    const view = toQuestionView({ ...base, status: 'resolved' });
    expect(view.correctOption).toBe('home');
    expect(view.distribution).toEqual({ home: 3, draw: 2 });
  });

  it('на залоченном вопросе правильный ответ ещё скрыт', () => {
    const view = toQuestionView({ ...base, status: 'locked' });
    expect(view.correctOption).toBeNull();
    expect(view.distribution).toEqual({ home: 3, draw: 2 });
  });

  it('мусор в jsonb не роняет страницу', () => {
    expect(parseOptions('не массив')).toEqual([]);
    expect(parseOptions([{ key: '', label: 'x' }])).toEqual([]);
    expect(parseDistribution([1, 2])).toBeNull();
    expect(parseDistribution({})).toBeNull();
  });
});

describe('лента и ожидающие действия', () => {
  it('неизвестный тип записи становится системным', () => {
    const rows: ActivityRow[] = [
      { id: 12, kind: 'roll', message: 'Бросок', created_at: '2026-11-12T17:00:00.000Z' },
      { id: '13', kind: 'matchday_closed', message: 'День закрыт', created_at: new Date('2026-11-12T18:00:00.000Z') },
    ];
    expect(toActivityViews(rows)).toEqual([
      { id: '12', kind: 'roll', message: 'Бросок', createdAt: '2026-11-12T17:00:00.000Z' },
      { id: '13', kind: 'system', message: 'День закрыт', createdAt: '2026-11-12T18:00:00.000Z' },
    ]);
  });

  it('отдаёт понятный payload и прячет неизвестные виды', () => {
    const row: PendingRow = {
      id: 'pa-1',
      event_id: 'ev-1',
      kind: 'var',
      payload: { reason: 'спорный гол' },
      expires_at: '2026-11-13T17:00:00.000Z',
    };
    expect(toPendingChoice(row)).toEqual({
      id: 'pa-1',
      eventId: 'ev-1',
      kind: 'var',
      payload: { reason: 'спорный гол' },
      expiresAt: '2026-11-13T17:00:00.000Z',
    });
    expect(toPendingChoice({ ...row, kind: 'auction' })).toBeNull();
    expect(toPendingChoice(null)).toBeNull();
  });
});

describe('кто смотрит', () => {
  it('зритель не играет, даже если он в сезоне', () => {
    const me = toMeView([PLAYER], { profileId: 'p-1', nickname: 'Шах', role: 'spectator' });
    expect(me).toEqual({ profileId: 'p-1', nickname: 'Шах', role: 'spectator', isPlayer: false });
  });

  it('игрок вне сезона не играет', () => {
    const me = toMeView([PLAYER_TWO], { profileId: 'p-1', nickname: 'Шах', role: 'player' });
    expect(me?.isPlayer).toBe(false);
  });

  it('админ в сезоне играет и может управлять', () => {
    const me = toMeView([PLAYER], { profileId: 'p-1', nickname: 'Шах', role: 'admin' });
    expect(me?.isPlayer).toBe(true);
  });

  it('без сессии — null', () => {
    expect(toMeView([PLAYER], null)).toBeNull();
  });
});
