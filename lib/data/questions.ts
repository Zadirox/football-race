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
  | { type: 'exact_score' }
  | { type: 'corners_total_over'; line: number }
  | { type: 'corners_more' }
  | { type: 'red_card' }
  | { type: 'yellow_cards_total_over'; line: number }
  | { type: 'possession_more' }
  | { type: 'shots_on_target_more' }
  | { type: 'shots_on_target_total_over'; line: number };

export type Score = {
  home: number | null;
  away: number | null;
  htHome: number | null;
  htAway: number | null;
};

export type MatchStats = {
  cornersHome: number | null;
  cornersAway: number | null;
  yellowCardsHome: number | null;
  yellowCardsAway: number | null;
  redCardsHome: number | null;
  redCardsAway: number | null;
  possessionHome: number | null;
  possessionAway: number | null;
  shotsOnTargetHome: number | null;
  shotsOnTargetAway: number | null;
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

function compareSides(home: number, away: number): 'home' | 'away' | 'draw' {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

/** Ответ из счёта и (для вопросов по статистике) данных матча. null — данных ещё нет. */
export function answerFor(rule: QuestionRule, score: Score, stats: MatchStats | null = null): string | null {
  const { home, away, htHome, htAway } = score;

  switch (rule.type) {
    case 'winner':
      if (home === null || away === null) return null;
      return compareSides(home, away);

    case 'total_over':
      if (home === null || away === null) return null;
      return home + away > rule.line ? 'yes' : 'no';

    case 'btts':
      if (home === null || away === null) return null;
      return home > 0 && away > 0 ? 'yes' : 'no';

    case 'team_total_over': {
      if (home === null || away === null) return null;
      const value = rule.side === 'away' ? away : home;
      return value >= rule.line ? 'yes' : 'no';
    }

    case 'first_half_goal':
      if (htHome === null || htAway === null) return null;
      return htHome + htAway > 0 ? 'yes' : 'no';

    case 'exact_score':
      if (home === null || away === null) return null;
      return `${home}:${away}`;

    case 'corners_total_over':
      if (!stats || stats.cornersHome === null || stats.cornersAway === null) return null;
      return stats.cornersHome + stats.cornersAway > rule.line ? 'yes' : 'no';

    case 'corners_more':
      if (!stats || stats.cornersHome === null || stats.cornersAway === null) return null;
      return compareSides(stats.cornersHome, stats.cornersAway);

    case 'red_card':
      if (!stats || stats.redCardsHome === null || stats.redCardsAway === null) return null;
      return stats.redCardsHome + stats.redCardsAway > 0 ? 'yes' : 'no';

    case 'yellow_cards_total_over':
      if (!stats || stats.yellowCardsHome === null || stats.yellowCardsAway === null) return null;
      return stats.yellowCardsHome + stats.yellowCardsAway > rule.line ? 'yes' : 'no';

    case 'possession_more':
      if (!stats || stats.possessionHome === null || stats.possessionAway === null) return null;
      if (stats.possessionHome === stats.possessionAway) return null;
      return stats.possessionHome > stats.possessionAway ? 'home' : 'away';

    case 'shots_on_target_more':
      if (!stats || stats.shotsOnTargetHome === null || stats.shotsOnTargetAway === null) return null;
      return compareSides(stats.shotsOnTargetHome, stats.shotsOnTargetAway);

    case 'shots_on_target_total_over':
      if (!stats || stats.shotsOnTargetHome === null || stats.shotsOnTargetAway === null) return null;
      return stats.shotsOnTargetHome + stats.shotsOnTargetAway > rule.line ? 'yes' : 'no';
  }
}

const YES_NO: QuestionOption[] = [
  { key: 'yes', label: 'Да' },
  { key: 'no', label: 'Нет' },
];

function homeDrawAway(homeName: string, awayName: string): QuestionOption[] {
  return [
    { key: 'home', label: homeName },
    { key: 'draw', label: 'Поровну' },
    { key: 'away', label: awayName },
  ];
}

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

    case 'corners_total_over':
      return {
        rule,
        kind: 'yes_no',
        prompt: `Тотал угловых больше ${rule.line} в матче ${homeName} — ${awayName}?`,
        options: YES_NO,
        isBonus: false,
      };

    case 'corners_more':
      return {
        rule,
        kind: 'choice',
        prompt: `У какой команды будет больше угловых: ${homeName} или ${awayName}?`,
        options: homeDrawAway(homeName, awayName),
        isBonus: false,
      };

    case 'red_card':
      return {
        rule,
        kind: 'yes_no',
        prompt: `Будет ли удаление в матче ${homeName} — ${awayName}?`,
        options: YES_NO,
        isBonus: false,
      };

    case 'yellow_cards_total_over':
      return {
        rule,
        kind: 'yes_no',
        prompt: `Тотал жёлтых карточек больше ${rule.line} в матче ${homeName} — ${awayName}?`,
        options: YES_NO,
        isBonus: false,
      };

    case 'possession_more':
      return {
        rule,
        kind: 'choice',
        prompt: `У какой команды будет больше владения: ${homeName} или ${awayName}?`,
        options: [
          { key: 'home', label: homeName },
          { key: 'away', label: awayName },
        ],
        isBonus: false,
      };

    case 'shots_on_target_more':
      return {
        rule,
        kind: 'choice',
        prompt: `У какой команды будет больше ударов в створ: ${homeName} или ${awayName}?`,
        options: homeDrawAway(homeName, awayName),
        isBonus: false,
      };

    case 'shots_on_target_total_over':
      return {
        rule,
        kind: 'yes_no',
        prompt: `Тотал ударов в створ больше ${rule.line} в матче ${homeName} — ${awayName}?`,
        options: YES_NO,
        isBonus: false,
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
  { type: 'corners_total_over', line: 8.5 },
  { type: 'corners_more' },
  { type: 'red_card' },
  { type: 'yellow_cards_total_over', line: 3.5 },
  { type: 'possession_more' },
  { type: 'shots_on_target_more' },
  { type: 'shots_on_target_total_over', line: 8.5 },
];

function pickRandomRules(
  rules: readonly QuestionRule[],
  count: number,
  random: () => number,
): QuestionRule[] {
  const pool = [...rules];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j]!;
    pool[j] = tmp!;
  }
  return pool.slice(0, count);
}

/**
 * 3–4 обычных вопроса на матч + 1 бонусный точный счёт (DECISIONS D6).
 * Набор обычных вопросов выбирается случайно из доступных типов.
 * Для детерминированного набора (демо/тесты) можно передать `random`.
 */
export function generateMatchQuestions(
  match: MatchForQuestions,
  _seed: number,
  regularCount = 4,
  options?: { random?: () => number },
): GeneratedQuestion[] {
  const count = Math.max(1, Math.min(4, regularCount));
  const random = options?.random ?? Math.random;
  const chosen = pickRandomRules(REGULAR_RULES, count, random);

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
