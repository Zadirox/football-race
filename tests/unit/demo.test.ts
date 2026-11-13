import { describe, expect, it } from 'vitest';
import { buildDemoSnapshot } from '@/lib/demo/snapshot';
import { generateReworkedBoard } from '@/lib/game/board';
import { gameDateOf, gameDayWindow, shiftGameDate } from '@/lib/time';
import { canAnswer, dayState } from '@/lib/game/day-state';

const NOW = new Date('2026-11-10T19:00:00.000Z');
const snapshot = buildDemoSnapshot(NOW);

if (!snapshot.matchday) throw new Error('демо-снимок должен содержать игровой день');
const matchday = snapshot.matchday;
const expectedGameDate = shiftGameDate(gameDateOf(NOW), 1);

describe('демо-снимок', () => {
  it('помечен как демо и не содержит ожидающих действий', () => {
    expect(snapshot.demo).toBe(true);
    expect(snapshot.pending).toBeNull();
    expect(snapshot.serverNow).toBe(NOW.toISOString());
  });

  it('детерминирован при одинаковом now', () => {
    expect(buildDemoSnapshot(NOW)).toEqual(snapshot);
  });

  it('собирает сезон на 5 матчей Лиги наций следующего игрового дня', () => {
    expect(snapshot.season.status).toBe('active');
    expect(snapshot.matches).toHaveLength(5);
    expect(snapshot.matches.every((m) => m.leagueCode === 'UNL')).toBe(true);
    expect(snapshot.matches.every((m) => m.questionCount === 4)).toBe(true);
    expect(matchday.gameDate).toBe(expectedGameDate);
  });

  it('все матчи, включая ночной, относятся к игровому дню снимка и ещё не начались', () => {
    for (const match of snapshot.matches) {
      expect(gameDateOf(new Date(match.kickoffUtc))).toBe(expectedGameDate);
      expect(match.status).toBe('NS');
      expect(Date.parse(match.kickoffUtc)).toBeGreaterThan(NOW.getTime());
    }
    expect(snapshot.matches.some((m) => new Date(m.kickoffUtc).getUTCHours() === 23)).toBe(true);
  });

  it('окно дня совпадает с gameDayWindow', () => {
    const { opensAt, closesAt } = gameDayWindow(expectedGameDate);
    expect(matchday.opensAt).toBe(opensAt.toISOString());
    expect(matchday.closesAt).toBe(closesAt.toISOString());
  });

  it('20 обычных вопросов и 5 бонусных на точный счёт, ответы открыты', () => {
    const regular = snapshot.questions.filter((q) => !q.isBonus);
    const bonus = snapshot.questions.filter((q) => q.isBonus);
    expect(regular).toHaveLength(20);
    expect(bonus).toHaveLength(5);
    expect(matchday.qTotal).toBe(20);
    expect(bonus.every((q) => q.options.length === 26)).toBe(true);
    expect(bonus.every((q) => q.options.some((o) => o.key === 'other'))).toBe(true);
    expect(dayState(matchday, NOW.getTime())).not.toBe('closed');
    expect(snapshot.questions.every((q) => q.status === 'open')).toBe(true);
    expect(snapshot.questions.every((q) => canAnswer(q, matchday, NOW.getTime()))).toBe(true);
  });

  it('среди вопросов есть новые типы по статистике', () => {
    const prompts = snapshot.questions.map((q) => q.prompt);
    expect(prompts.some((p) => /углов/i.test(p))).toBe(true);
    expect(prompts.some((p) => /удален|жёлт|владен|удар/i.test(p))).toBe(true);
  });

  it('все варианты «моего» ответа существуют в вопросе', () => {
    const answered = snapshot.questions.filter((q) => q.myChoice !== null);
    expect(answered.length).toBe(16);
    for (const question of answered) {
      expect(question.options.map((o) => o.key)).toContain(question.myChoice);
    }
  });

  it('вопросы открыты и закрываются вместе с матчем', () => {
    for (const question of snapshot.questions) {
      expect(question.status).toBe('open');
      const match = snapshot.matches.find((m) => m.id === question.matchId);
      expect(match).toBeDefined();
      expect(question.locksAt).toBe(match?.kickoffUtc);
    }
  });

  it('возвращает 80 клеток переработанной раскладки', () => {
    const board = generateReworkedBoard();
    expect(snapshot.cells).toEqual(
      board.cells.map((c) => ({ idx: c.idx, kind: c.kind, mechanicCode: c.mechanicCode })),
    );
    expect(snapshot.cells[0]?.kind).toBe('start');
    expect(snapshot.cells[79]?.kind).toBe('finish');
  });

  it('в сезоне 6 участников и ровно один «я»', () => {
    const me = snapshot.players.filter((p) => p.isMe);
    expect(me).toHaveLength(1);
    expect(me[0]?.profileId).toBe('p-admin');
    expect(me[0]?.role).toBe('admin');
    expect(snapshot.players).toHaveLength(6);
    expect(snapshot.players.every((p) => p.position >= 1 && p.position <= 80)).toBe(true);
  });

  it('«я» — админ и игрок одновременно', () => {
    expect(snapshot.me).toMatchObject({ profileId: 'p-admin', role: 'admin', isPlayer: true });
  });

  it('рейтинги считаются по тем же игрокам', () => {
    expect(snapshot.ratingsSeed).toHaveLength(6);
    expect(snapshot.ratingsSeed.map((r) => r.profileId).sort()).toEqual(
      snapshot.players.map((p) => p.profileId).sort(),
    );
    expect(snapshot.ratingsSeed.every((r) => r.answered >= r.correct)).toBe(true);
  });

  it('в ленте есть свежие события в стабильном порядке', () => {
    expect(snapshot.activity.length).toBe(8);
    const times = snapshot.activity.map((a) => Date.parse(a.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
