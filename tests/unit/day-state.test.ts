import { describe, expect, it } from 'vitest';
import { canAnswer, dayState, questionLocked, type MatchdayView } from '@/lib/game/day-state';
import type { QuestionView } from '@/lib/types';

const MATCHDAY: MatchdayView = {
  id: 'md-1',
  gameDate: '2026-11-12',
  opensAt: '2026-11-12T06:00:00.000Z', // 09:00 МСК
  closesAt: '2026-11-13T05:59:59.999Z', // 08:59:59.999 МСК следующего дня
  status: 'scheduled',
  qTotal: 16,
};

const QUESTION: QuestionView = {
  id: 'q-1',
  matchId: 'm-1',
  kind: 'choice',
  prompt: 'Кто победит?',
  options: [
    { key: 'home', label: 'Хозяева' },
    { key: 'away', label: 'Гости' },
  ],
  isBonus: false,
  locksAt: '2026-11-12T17:00:00.000Z',
  status: 'open',
  correctOption: null,
  myChoice: null,
  distribution: null,
};

const at = (iso: string) => Date.parse(iso);

describe('фаза игрового дня', () => {
  it('до открытия окна — upcoming, но ответы на будущие матчи ещё принимаются', () => {
    const now = at('2026-11-11T20:00:00.000Z');
    expect(dayState(MATCHDAY, now)).toBe('upcoming');
    expect(canAnswer(QUESTION, MATCHDAY, now)).toBe(true);
  });

  it('на границе открытия переходит в open', () => {
    expect(dayState(MATCHDAY, at('2026-11-12T05:59:59.998Z'))).toBe('upcoming');
    expect(dayState(MATCHDAY, at('2026-11-12T06:00:00.000Z'))).toBe('open');
  });

  it('закрывается ровно в closesAt', () => {
    expect(dayState(MATCHDAY, at('2026-11-13T05:59:59.998Z'))).toBe('open');
    expect(dayState(MATCHDAY, at('2026-11-13T05:59:59.999Z'))).toBe('closed');
  });

  it('явный статус closed закрывает день независимо от времени', () => {
    expect(dayState({ ...MATCHDAY, status: 'closed' }, at('2026-11-12T12:00:00.000Z'))).toBe('closed');
  });

  it('без игрового дня приём закрыт', () => {
    expect(dayState(null, at('2026-11-12T12:00:00.000Z'))).toBe('closed');
  });

  it('битые даты не ломают расчёт: день считается открытым', () => {
    const broken = { ...MATCHDAY, opensAt: 'не дата', closesAt: 'тоже' };
    expect(dayState(broken, at('2026-11-12T12:00:00.000Z'))).toBe('open');
  });
});

describe('лок вопроса', () => {
  it('принимает ответ до старта матча', () => {
    expect(questionLocked(QUESTION, at('2026-11-12T16:59:59.999Z'))).toBe(false);
  });

  it('закрывается в момент старта матча', () => {
    expect(questionLocked(QUESTION, at('2026-11-12T17:00:00.000Z'))).toBe(true);
  });

  it('снятый с приёма вопрос закрыт раньше кикоффа', () => {
    expect(questionLocked({ ...QUESTION, status: 'locked' }, at('2026-11-12T10:00:00.000Z'))).toBe(true);
  });

  it('закрытый день закрывает и незалоченный вопрос', () => {
    expect(canAnswer(QUESTION, { ...MATCHDAY, status: 'closed' }, at('2026-11-12T10:00:00.000Z'))).toBe(false);
  });
});
