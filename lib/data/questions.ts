/**
 * Шаблоны предиктов без букмекерской линии (DECISIONS D1).
 * Правильный ответ считается из финального счёта — тем же правилом,
 * что и в SQL-функции `fn_question_answer`.
 */

export type QuestionRule =
  | { type: 'winner' }
  | { type: 'total_over'; line: number }
  | { type: 'btts' }
  | { type: 'team_total_over'; side: 'home' | 'away'; line: number }
  | { type: 'first_half_goal' }
  | { type: 'exact_score' };

export type Score = {
  home: number | null;
  away: number | null;
  htHome: number | null;
  htAway: number | null;
};

export type QuestionOption = { key: string; label: string };

export type GeneratedQuestion = {
  rule: QuestionRule;
  kind: 'choice' | 'yes_no' | 'exact_score';
  prompt: string;
  options: QuestionOption[];
  isBonus: boolean;
};

export type MatchForQuestions = {
  homeName: string;
  awayName: string;
};

/** Ответ из счёта. null — матч ещё не готов (нет счёта). */
export function answerFor(rule: QuestionRule, score: Score): string | null {
  const { home, away, htHome, htAway } = score;
  if (home === null || away === null) return null;

  switch (rule.type) {
    case 'winner':
      if (home > away) return 'home';
      if (home < away) return 'away';
      return 'draw';

    case 'total_over':
      return home + away > rule.line ? 'yes' : 'no';

    case 'btts':
      return home > 0 && away > 0 ? 'yes' : 'no';

    case 'team_total_over': {
      const value = rule.side === 'away' ? away : home;
      return value >= rule.line ? 'yes' : 'no';
    }

    case 'first_half_goal':
      if (htHome === null || htAway === null) return null;
      return htHome + htAway > 0 ? 'yes' : 'no';

    case 'exact_score':
      return `${home}:${away}`;
  }
}

const YES_NO: QuestionOption[] = [
  { key: 'yes', label: 'Да' },
  { key: 'no', label: 'Нет' },
];

/**
 * Тексты вопросов. Один источник для админки, предиктов и предпросмотра.
 */
export function questionFor(rule: QuestionRule, match: MatchForQuestions): GeneratedQuestion {
  const { homeName, awayName } = match;

  switch (rule.type) {
    case 'winner':
      return {
        rule,
        kind: 'choice',
        prompt: `${homeName} — ${awayName}: кто победит?`,
        options: [
          { key: 'home', label: homeName },
          { key: 'draw', label: 'Ничья' },
          { key: 'away', label: awayName },
        ],
        isBonus: false,
      };

    case 'total_over':
      return {
        rule,
        kind: 'yes_no',
        prompt: `Тотал больше ${rule.line} в матче ${homeName} — ${awayName}?`,
        options: YES_NO,
        isBonus: false,
      };

    case 'btts':
      return {
        rule,
        kind: 'yes_no',
        prompt: `Обе забьют в матче ${homeName} — ${awayName}?`,
        options: YES_NO,
        isBonus: false,
      };

    case 'team_total_over': {
      const sideName = rule.side === 'away' ? awayName : homeName;
      return {
        rule,
        kind: 'yes_no',
        prompt: `${sideName} забьёт ${rule.line} или больше?`,
        options: YES_NO,
        isBonus: false,
      };
    }

    case 'first_half_goal':
      return {
        rule,
        kind: 'yes_no',
        prompt: `Будет ли гол в первом тайме ${homeName} — ${awayName}?`,
        options: YES_NO,
        isBonus: false,
      };

    case 'exact_score':
      return {
        rule,
        kind: 'exact_score',
        prompt: `Точный счёт матча ${homeName} — ${awayName}`,
        options: exactScoreOptions(),
        isBonus: true,
      };
  }
}

/** Сетка точного счёта: 0:0 … 4:4 плюс «другой». */
export function exactScoreOptions(): QuestionOption[] {
  const options: QuestionOption[] = [];
  for (let home = 0; home <= 4; home++) {
    for (let away = 0; away <= 4; away++) {
      options.push({ key: `${home}:${away}`, label: `${home}:${away}` });
    }
  }
  options.push({ key: 'other', label: 'Другой счёт' });
  return options;
}

const REGULAR_RULES: readonly QuestionRule[] = [
  { type: 'winner' },
  { type: 'total_over', line: 2.5 },
  { type: 'btts' },
  { type: 'team_total_over', side: 'home', line: 2 },
  { type: 'first_half_goal' },
];

/**
 * 3–4 обычных вопроса на матч + 1 бонусный точный счёт (DECISIONS D6).
 * Выбор шаблонов детерминирован по `seed` — один и тот же матч
 * даёт одинаковый набор в предпросмотре и после генерации.
 */
export function generateMatchQuestions(
  match: MatchForQuestions,
  seed: number,
  regularCount = 4,
): GeneratedQuestion[] {
  const rules = [...REGULAR_RULES];
  const offset = Math.abs(Math.trunc(seed)) % rules.length;
  const rotated = [...rules.slice(offset), ...rules.slice(0, offset)];
  const chosen = rotated.slice(0, Math.max(1, Math.min(4, regularCount)));

  const questions = chosen.map((rule) => questionFor(rule, match));
  questions.push(questionFor({ type: 'exact_score' }, match));
  return questions;
}

/** Хелпер: «2:1» → части. Пригодится в UI и тестах. */
export function parseExactScore(value: string): { home: number; away: number } | null {
  const match = /^(\d+):(\d+)$/.exec(value.trim());
  if (!match) return null;
  return { home: Number(match[1]), away: Number(match[2]) };
}

/** «Другой счёт» считается верным, если ни одна клетка сетки не подошла. */
export function isExactScoreCorrect(choice: string, home: number, away: number): boolean {
  if (choice === 'other') return home > 4 || away > 4;
  const parsed = parseExactScore(choice);
  if (!parsed) return false;
  return parsed.home === home && parsed.away === away;
}
