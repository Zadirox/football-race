/**
 * Демо-снимок: полноценный игровой день без Supabase.
 *
 * Нужен для двух вещей:
 *  1) сайт открывается и играется до подключения БД (дедлайн 12 ноября);
 *  2) визуальная проверка карты, предиктов и рейтингов на реальных объёмах.
 *
 * Данные детерминированы — одинаковый снимок на сервере и клиенте.
 */

import { generateBoard } from '@/lib/game/board';
import { gameDayWindow } from '@/lib/time';
import { generateMatchQuestions, type GeneratedQuestion } from '@/lib/data/questions';
import type {
  ActivityView,
  MatchView,
  PlayerView,
  QuestionView,
  SeasonSnapshot,
} from '@/lib/types';

const SEASON_ID = 'demo-season-2026';
const MATCHDAY_ID = 'demo-matchday-2026-11-12';
const GAME_DATE = '2026-11-12';

type DemoMatch = {
  id: string;
  leagueCode: string;
  leagueTitle: string;
  homeName: string;
  awayName: string;
  kickoff: string;
  status: MatchView['status'];
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
};

const MATCHES: DemoMatch[] = [
  {
    id: 'm-1',
    leagueCode: 'UNL',
    leagueTitle: 'Лига наций',
    homeName: 'Сербия',
    awayName: 'Швейцария',
    kickoff: '2026-11-12T17:00:00.000Z',
    status: 'NS',
    homeScore: null,
    awayScore: null,
    minute: null,
  },
  {
    id: 'm-2',
    leagueCode: 'UNL',
    leagueTitle: 'Лига наций',
    homeName: 'Франция',
    awayName: 'Италия',
    kickoff: '2026-11-12T19:45:00.000Z',
    status: 'NS',
    homeScore: null,
    awayScore: null,
    minute: null,
  },
  {
    id: 'm-3',
    leagueCode: 'UNL',
    leagueTitle: 'Лига наций',
    homeName: 'Испания',
    awayName: 'Нидерланды',
    kickoff: '2026-11-12T19:45:00.000Z',
    status: 'NS',
    homeScore: null,
    awayScore: null,
    minute: null,
  },
  {
    id: 'm-4',
    leagueCode: 'UNL',
    leagueTitle: 'Лига наций',
    homeName: 'Португалия',
    awayName: 'Хорватия',
    kickoff: '2026-11-12T21:00:00.000Z',
    status: 'NS',
    homeScore: null,
    awayScore: null,
    minute: null,
  },
  {
    id: 'm-5',
    leagueCode: 'UNL',
    leagueTitle: 'Лига наций',
    homeName: 'Германия',
    awayName: 'Англия',
    kickoff: '2026-11-12T23:00:00.000Z',
    status: 'NS',
    homeScore: null,
    awayScore: null,
    minute: null,
  },
];

type DemoPlayer = {
  id: string;
  nickname: string;
  role: PlayerView['role'];
  position: number;
  points: number;
  answered: number;
  correct: number;
  dice: PlayerView['dice'];
  effectCodes: string[];
  lastAction: string | null;
};

const PLAYERS: DemoPlayer[] = [
  {
    id: 'p-admin',
    nickname: 'Шах',
    role: 'admin',
    position: 17,
    points: 320,
    answered: 46,
    correct: 29,
    dice: { wood: 0, bronze: 2, silver: 1, gold: 1 },
    effectCodes: ['tribuny'],
    lastAction: 'Ответил на вопрос про тотал',
  },
  {
    id: 'p-anya',
    nickname: 'Аня',
    role: 'player',
    position: 23,
    points: 410,
    answered: 52,
    correct: 34,
    dice: { wood: 0, bronze: 1, silver: 2, gold: 0 },
    effectCodes: [],
    lastAction: 'Контратака: +3',
  },
  {
    id: 'p-mark',
    nickname: 'Марк',
    role: 'player',
    position: 31,
    points: 280,
    answered: 44,
    correct: 25,
    dice: { wood: 0, bronze: 3, silver: 0, gold: 1 },
    effectCodes: ['gazon'],
    lastAction: 'Офсайд: −2',
  },
  {
    id: 'p-dima',
    nickname: 'Дима',
    role: 'player',
    position: 12,
    points: 190,
    answered: 41,
    correct: 21,
    dice: { wood: 1, bronze: 1, silver: 1, gold: 0 },
    effectCodes: ['yellow_card'],
    lastAction: 'Жёлтая карточка',
  },
  {
    id: 'p-liza',
    nickname: 'Лиза',
    role: 'player',
    position: 44,
    points: 460,
    answered: 48,
    correct: 36,
    dice: { wood: 0, bronze: 0, silver: 1, gold: 2 },
    effectCodes: ['shieldki'],
    lastAction: 'Щитки: заряд на один негатив',
  },
  {
    id: 'p-kirill',
    nickname: 'Кирилл',
    role: 'player',
    position: 8,
    points: 120,
    answered: 38,
    correct: 18,
    dice: { wood: 0, bronze: 1, silver: 0, gold: 0 },
    effectCodes: [],
    lastAction: 'Пока мимо',
  },
];

const EFFECT_CHARGES: Record<string, number> = {
  tribuny: 2,
  gazon: 1,
  shieldki: 1,
  yellow_card: 1,
  tactics: 1,
};

/**
 * Ответ «меня» в демо. Считается от типа вопроса, а не от порядкового
 * номера: набор шаблонов у каждого матча свой (см. `generateMatchQuestions`),
 * поэтому жёсткая карта индексов давала варианты, которых нет в вопросе.
 *
 * Каждый пятый вопрос оставлен без ответа — так виден прогресс заполнения.
 */
function demoChoice(question: GeneratedQuestion, index: number): string | null {
  if (question.isBonus) return null;
  if (index % 5 === 4) return null;
  if (question.kind === 'choice') return 'home';
  if (question.kind === 'yes_no') return index % 2 === 0 ? 'yes' : 'no';
  return null;
}

function buildQuestions(): QuestionView[] {
  const all: QuestionView[] = [];
  let index = 0;

  MATCHES.forEach((match, matchIndex) => {
    const generated = generateMatchQuestions(
      { homeName: match.homeName, awayName: match.awayName },
      100 + matchIndex,
      4,
    );
    generated.forEach((q, qIndex) => {
      const id = `q-${match.id}-${qIndex}`;
      all.push({
        id,
        matchId: match.id,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        isBonus: q.isBonus,
        locksAt: match.kickoff,
        status: 'open',
        correctOption: null,
        myChoice: demoChoice(q, index),
        distribution: null,
      });
      if (!q.isBonus) index += 1;
    });
  });

  return all;
}

function buildMatches(): MatchView[] {
  const questions = buildQuestions();
  return MATCHES.map((m) => {
    const own = questions.filter((q) => q.matchId === m.id);
    const regular = own.filter((q) => !q.isBonus);
    return {
      id: m.id,
      leagueCode: m.leagueCode,
      leagueTitle: m.leagueTitle,
      homeName: m.homeName,
      homeLogo: null,
      awayName: m.awayName,
      awayLogo: null,
      kickoffUtc: m.kickoff,
      status: m.status,
      minute: m.minute,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      questionCount: regular.length,
      myAnswered: regular.filter((q) => q.myChoice !== null).length,
      inPredictions: true,
    };
  });
}

function buildPlayers(): PlayerView[] {
  const me = 'p-admin';
  return PLAYERS.map((p) => ({
    profileId: p.id,
    nickname: p.nickname,
    avatarUrl: null,
    role: p.role,
    position: p.position,
    finishedAt: null,
    points: p.points,
    answered: p.answered,
    correct: p.correct,
    effects: p.effectCodes.map((code) => ({ code, charges: EFFECT_CHARGES[code] ?? 1 })) as PlayerView['effects'],
    dice: p.dice,
    lastAction: p.lastAction,
    isMe: p.id === me,
    favoriteClub: null,
    favoriteNationalTeam: null,
    favoritePlayer: null,
  }));
}

function buildActivity(): ActivityView[] {
  const now = Date.parse('2026-11-10T19:42:00.000Z');
  const items: Array<[string, ActivityView['kind'], number]> = [
    ['Лиза отвечает 12-й день подряд и держит золото', 'reward', 2],
    ['Марк бросает серебряный кубик: 4', 'roll', 6],
    ['Офсайд. Флажок поднят — Марк откатывается на две клетки', 'negative', 7],
    ['Аня: Контратака, плюс три клетки', 'positive', 14],
    ['Дима получает жёлтую карточку', 'negative', 21],
    ['Щитки спасают Лизу от скользкого газона', 'positive', 34],
    ['Игровой день 12 ноября собран: 5 матчей, 20 вопросов', 'system', 58],
    ['Кирилл: «Пока мимо». Бывает', 'neutral', 76],
  ];

  return items.map(([message, kind, minutesAgo], i) => ({
    id: `a-${i}`,
    kind,
    message,
    createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
  }));
}

export function buildDemoSnapshot(now = new Date()): SeasonSnapshot {
  const { opensAt, closesAt } = gameDayWindow(GAME_DATE);
  const players = buildPlayers();
  const questions = buildQuestions();
  const matches = buildMatches();
  const board = generateBoard(20261112);

  const regular = questions.filter((q) => !q.isBonus);

  return {
    season: {
      id: SEASON_ID,
      slug: 'winter-2026',
      title: 'Зимний сезон 2026',
      status: 'active',
      startsOn: '2026-11-12',
      endsOn: '2027-03-01',
    },
    players,
    cells: board.cells.map((c) => ({ idx: c.idx, kind: c.kind, mechanicCode: c.mechanicCode })),
    matchday: {
      id: MATCHDAY_ID,
      gameDate: GAME_DATE,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      status: 'scheduled',
      qTotal: regular.length,
    },
    matches,
    questions,
    activity: buildActivity(),
    ratingsSeed: players.map((p) => ({
      profileId: p.profileId,
      nickname: p.nickname,
      position: p.position,
      finishedAt: p.finishedAt,
      points: p.points,
      answered: p.answered,
      correct: p.correct,
    })),
    me: {
      profileId: 'p-admin',
      nickname: 'Шах',
      role: 'admin',
      isPlayer: true,
    },
    pending: null,
    serverNow: now.toISOString(),
    demo: true,
  };
}

