import { describe, expect, it } from 'vitest';
import {
  answerFor,
  exactScoreOptions,
  generateMatchQuestions,
  isExactScoreCorrect,
  parseExactScore,
  questionFor,
  type Score,
} from '@/lib/data/questions';

const match = { homeName: 'Арсенал', awayName: 'Челси' };

function score(overrides: Partial<Score> = {}): Score {
  return { home: 2, away: 1, htHome: 1, htAway: 0, ...overrides };
}

describe('ответы из счёта', () => {
  it('победитель', () => {
    expect(answerFor({ type: 'winner' }, score())).toBe('home');
    expect(answerFor({ type: 'winner' }, score({ home: 1, away: 1 }))).toBe('draw');
    expect(answerFor({ type: 'winner' }, score({ home: 0, away: 3 }))).toBe('away');
  });

  it('тотал 2.5', () => {
    expect(answerFor({ type: 'total_over', line: 2.5 }, score({ home: 2, away: 1 }))).toBe('yes');
    expect(answerFor({ type: 'total_over', line: 2.5 }, score({ home: 1, away: 1 }))).toBe('no');
    expect(answerFor({ type: 'total_over', line: 2.5 }, score({ home: 2, away: 0 }))).toBe('no');
  });

  it('обе забьют', () => {
    expect(answerFor({ type: 'btts' }, score())).toBe('yes');
    expect(answerFor({ type: 'btts' }, score({ away: 0 }))).toBe('no');
  });

  it('тотал одной команды 2+', () => {
    expect(answerFor({ type: 'team_total_over', side: 'home', line: 2 }, score())).toBe('yes');
    expect(answerFor({ type: 'team_total_over', side: 'away', line: 2 }, score())).toBe('no');
    expect(answerFor({ type: 'team_total_over', side: 'away', line: 2 }, score({ away: 2 }))).toBe('yes');
  });

  it('гол в первом тайме', () => {
    expect(answerFor({ type: 'first_half_goal' }, score())).toBe('yes');
    expect(answerFor({ type: 'first_half_goal' }, score({ htHome: 0, htAway: 0 }))).toBe('no');
  });

  it('точный счёт', () => {
    expect(answerFor({ type: 'exact_score' }, score())).toBe('2:1');
  });

  it('без счёта ответа нет', () => {
    expect(answerFor({ type: 'winner' }, score({ home: null }))).toBeNull();
    expect(answerFor({ type: 'first_half_goal' }, score({ htHome: null }))).toBeNull();
  });
});

describe('тексты вопросов', () => {
  it('победа — три варианта', () => {
    const q = questionFor({ type: 'winner' }, match);
    expect(q.prompt).toContain('Арсенал');
    expect(q.options.map((o) => o.key)).toEqual(['home', 'draw', 'away']);
    expect(q.isBonus).toBe(false);
  });

  it('тотал — да/нет и порог в тексте', () => {
    const q = questionFor({ type: 'total_over', line: 2.5 }, match);
    expect(q.prompt).toContain('2.5');
    expect(q.kind).toBe('yes_no');
  });

  it('точный счёт — бонусный', () => {
    const q = questionFor({ type: 'exact_score' }, match);
    expect(q.isBonus).toBe(true);
    expect(q.kind).toBe('exact_score');
    expect(q.options).toHaveLength(exactScoreOptions().length);
  });
});

describe('генерация вопросов на матч', () => {
  it('4 обычных + 1 бонусный', () => {
    const questions = generateMatchQuestions(match, 7);
    expect(questions).toHaveLength(5);
    expect(questions.filter((q) => q.isBonus)).toHaveLength(1);
    expect(questions[questions.length - 1]?.isBonus).toBe(true);
  });

  it('можно попросить 3 обычных', () => {
    expect(generateMatchQuestions(match, 7, 3)).toHaveLength(4);
  });

  it('детерминировано по сиду', () => {
    const a = generateMatchQuestions(match, 42);
    const b = generateMatchQuestions(match, 42);
    expect(a).toEqual(b);
  });

  it('разные сиды дают разные наборы', () => {
    const a = generateMatchQuestions(match, 1).map((q) => q.rule.type);
    const b = generateMatchQuestions(match, 2).map((q) => q.rule.type);
    expect(a).not.toEqual(b);
  });

  it('не больше одного вопроса одного шаблона', () => {
    const types = generateMatchQuestions(match, 3).map((q) => q.rule.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('точный счёт', () => {
  it('сетка 0:0 … 4:4 и «другой»', () => {
    expect(exactScoreOptions()).toHaveLength(26);
    expect(exactScoreOptions()[0]?.key).toBe('0:0');
    expect(exactScoreOptions().at(-1)?.key).toBe('other');
  });

  it('парсит счёт', () => {
    expect(parseExactScore('3:2')).toEqual({ home: 3, away: 2 });
    expect(parseExactScore('other')).toBeNull();
  });

  it('«другой счёт» верен только вне сетки', () => {
    expect(isExactScoreCorrect('2:1', 2, 1)).toBe(true);
    expect(isExactScoreCorrect('2:1', 1, 1)).toBe(false);
    expect(isExactScoreCorrect('other', 5, 0)).toBe(true);
    expect(isExactScoreCorrect('other', 2, 1)).toBe(false);
  });
});
