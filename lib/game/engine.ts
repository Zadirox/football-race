/**
 * Движок событий: чистые функции, без БД и без сети (DECISIONS D2).
 *
 * Правила из docs/04 §1.2:
 *  - событие срабатывает только на конечной клетке броска;
 *  - дополнительные перемещения не запускают новое событие;
 *  - позиция не уходит ниже 1 и выше 80;
 *  - Щитки отменяют только «щитуемые» негативы, добровольный риск — нет.
 */

import { mechanicName } from './catalog';

export const FIRST_CELL = 1;
export const LAST_CELL = 80;

export type EffectCode =
  | 'tribuny'
  | 'gazon'
  | 'shieldki'
  | 'yellow_card'
  | 'tactics'
  | 'press_trap'
  | 'dirty_time'
  | 'broken_boot'
  | 'tribune_panic'
  | 'second_breath';

export type ActiveEffect = {
  code: EffectCode;
  charges: number;
};

export type PlayerState = {
  position: number;
  effects: ActiveEffect[];
  finished: boolean;
};

/** Debuffs removable by Раздевалка (07) / Бутылка с водой (36). */
export const NEGATIVE_EFFECTS: readonly EffectCode[] = [
  'gazon',
  'yellow_card',
  'press_trap',
  'dirty_time',
  'broken_boot',
  'tribune_panic',
];

export function makePlayer(position = FIRST_CELL, effects: ActiveEffect[] = []): PlayerState {
  return { position, effects, finished: position >= LAST_CELL };
}

export function hasEffect(state: PlayerState, code: EffectCode): boolean {
  return state.effects.some((e) => e.code === code && e.charges > 0);
}

export function effectCharges(state: PlayerState, code: EffectCode): number {
  return state.effects.find((e) => e.code === code)?.charges ?? 0;
}

export function addEffect(state: PlayerState, code: EffectCode, charges = 1): PlayerState {
  const existing = state.effects.find((e) => e.code === code);
  const effects = existing
    ? state.effects.map((e) => (e.code === code ? { ...e, charges: Math.max(e.charges, charges) } : e))
    : [...state.effects, { code, charges }];
  return { ...state, effects };
}

export function removeEffect(state: PlayerState, code: EffectCode): PlayerState {
  return { ...state, effects: state.effects.filter((e) => e.code !== code) };
}

/** Тратит один заряд эффекта; нулевые заряды убираются. */
export function spendCharge(state: PlayerState, code: EffectCode): PlayerState {
  const current = effectCharges(state, code);
  if (current <= 0) return state;
  if (current === 1) return removeEffect(state, code);
  return {
    ...state,
    effects: state.effects.map((e) => (e.code === code ? { ...e, charges: e.charges - 1 } : e)),
  };
}

export function moveBy(state: PlayerState, delta: number): PlayerState {
  const next = Math.min(LAST_CELL, Math.max(FIRST_CELL, state.position + delta));
  return { ...state, position: next, finished: next >= LAST_CELL };
}

export type RollModifiers = {
  tribuny: boolean;
  gazon: boolean;
  secondBreath: boolean;
  pressTrap: boolean;
  brokenBoot: boolean;
  tribunePanic: boolean;
  dirtyTime: boolean;
};

/**
 * �������� roll-������������ ����� �������.
 * ����������� ������� �����������, �����-�������� ������ 1 �����.
 * ��� �������� ������������ ����������� � ����� ������, ����� �����������.
 * ������� ���������� � applyRollModifiers: flat buffs/debuffs, dirtyTime cap, min 1.
 */
export function takeRollModifiers(state: PlayerState): { state: PlayerState; mods: RollModifiers } {
  const mods: RollModifiers = {
    tribuny: hasEffect(state, 'tribuny'),
    gazon: hasEffect(state, 'gazon'),
    secondBreath: hasEffect(state, 'second_breath'),
    pressTrap: hasEffect(state, 'press_trap'),
    brokenBoot: hasEffect(state, 'broken_boot'),
    tribunePanic: hasEffect(state, 'tribune_panic'),
    dirtyTime: hasEffect(state, 'dirty_time'),
  };
  let next = state;
  if (mods.tribuny) next = spendCharge(next, 'tribuny');
  if (mods.gazon) next = spendCharge(next, 'gazon');
  if (mods.secondBreath) next = spendCharge(next, 'second_breath');
  if (mods.pressTrap) next = spendCharge(next, 'press_trap');
  if (mods.brokenBoot) next = spendCharge(next, 'broken_boot');
  if (mods.tribunePanic) next = spendCharge(next, 'tribune_panic');
  if (mods.dirtyTime) next = spendCharge(next, 'dirty_time');
  return { state: next, mods };
}

export type CellChoice =
  | 'var'
  | 'passage'
  | 'locker'
  | 'pack_choice'
  | 'penalty'
  | 'dribble'
  | 'super_sub'
  | 'corner'
  | 'foul'
  | 'red_var'
  | 'attack_break';

export type CellOutcome = {
  state: PlayerState;
  /** Код механики, если событие было. */
  code: string | null;
  /** Дополнительное перемещение, уже применённое к state. */
  delta: number;
  /** Что поглотило эффект. */
  preventedBy: 'shieldki' | 'yellow_card' | null;
  /** Поглощённый эффект (для анимации «карточка сгорела»). */
  absorbed: EffectCode | null;
  /** Если нужно решение игрока — какое. Тактика решается на следующем броске. */
  awaiting: CellChoice | null;
  /** Строка в ленту комментатора. */
  log: string;
};

function base(code: string | null, state: PlayerState, log: string): CellOutcome {
  return {
    state,
    code,
    delta: 0,
    preventedBy: null,
    absorbed: null,
    awaiting: null,
    log,
  };
}

function moved(code: string, state: PlayerState, from: number, next: PlayerState, log: string): CellOutcome {
  return { ...base(code, next, log), delta: next.position - from };
}

/**
 * Разрешает событие клетки. `random` нужен только событиям с риском,
 * но передаётся всегда — так подпись стабильна.
 */
export function resolveCell(
  state: PlayerState,
  code: string | null,
  who: string,
  random: () => number = Math.random,
): CellOutcome {
  if (!code) return base(null, state, `${who} попал на обычную клетку.`);

  switch (code) {
    case '01': {
      const next = moveBy(state, 3);
      return moved(code, state, state.position, next, `Контратака! ${who} проскакивает трёх защитников.`);
    }

    case '02': {
      if (hasEffect(state, 'shieldki')) {
        return {
          ...base(code, spendCharge(state, 'shieldki'), `«Щитки» спасли ${who} от офсайда.`),
          preventedBy: 'shieldki',
        };
      }
      const next = moveBy(state, -2);
      return moved(code, state, state.position, next, `Офсайд: ${who} возвращается на 2 клетки назад.`);
    }

    case '03':
      return {
        ...base(code, state, `${who} может отдать пас другому игроку (+1 клетка).`),
        awaiting: 'passage',
      };

    case '04': {
      if (hasEffect(state, 'shieldki')) {
        return {
          ...base(code, spendCharge(state, 'shieldki'), `«Щитки» спасли ${who} от скользкого газона.`),
          preventedBy: 'shieldki',
        };
      }
      return base(code, addEffect(state, 'gazon', 1), `${who} на скользком газоне: следующий бросок будет на 1 меньше.`);
    }

    case '05': {
      if (hasEffect(state, 'yellow_card')) {
        return {
          ...base(code, removeEffect(state, 'yellow_card'), `У ${who} была жёлтая карточка — «Домашние трибуны» не сработали.`),
          absorbed: 'yellow_card',
        };
      }
      return base(code, addEffect(state, 'tribuny', 2), `«Домашние трибуны» помогают: у ${who} +1 к двум следующим броскам.`);
    }

    case '06': {
      if (hasEffect(state, 'yellow_card')) {
        return {
          ...base(code, removeEffect(state, 'yellow_card'), `У ${who} была жёлтая карточка — «Щитки» не сработали.`),
          absorbed: 'yellow_card',
        };
      }
      return base(code, addEffect(state, 'shieldki', 1), `${who} получил «Щитки»: один плохой эффект будет отменён.`);
    }

    case '07': {
      const negatives = state.effects.filter(
        (e) => NEGATIVE_EFFECTS.includes(e.code) && e.charges > 0,
      );
      if (negatives.length > 0) {
        return {
          ...base(code, state, `${who} в раздевалке: можно снять один плохой эффект.`),
          awaiting: 'locker',
        };
      }
      const next = moveBy(state, 1);
      return moved(code, state, state.position, next, `В раздевалке делать нечего: ${who} делает шаг вперёд.`);
    }

    case '08': {
      if (hasEffect(state, 'shieldki')) {
        return {
          ...base(code, spendCharge(state, 'shieldki'), `«Щитки» спасли ${who} от жёлтой карточки.`),
          preventedBy: 'shieldki',
        };
      }
      return base(code, addEffect(state, 'yellow_card', 1), `${who} получил жёлтую карточку: следующее усиление не сработает.`);
    }

    case '09':
      return {
        ...base(code, state, `VAR: ${who} решает — согласиться с судьёй или оспорить.`),
        awaiting: 'var',
      };

    case '10': {
      if (hasEffect(state, 'yellow_card')) {
        return {
          ...base(code, removeEffect(state, 'yellow_card'), `Жёлтая карточка забрала усиление «Тактическая схема» у ${who}.`),
          absorbed: 'yellow_card',
        };
      }
      return {
        ...base(code, addEffect(state, 'tactics', 1), `«Тактическая схема»: ${who} сможет изменить следующий бросок на +1 или −1.`),
      };
    }

    case '19':
      return base(code, state, `${who} попадает на клетку «Пак на выбор» и получает пак «Сборные».`);

    case '20':
      return base(code, state, `${who} заглядывает на клетку с будущей механикой. Пока здесь спокойно.`);

    default:
      return base(code, state, `${who} попадает на «${mechanicName(code)}».`);
  }
}

/** VAR: «принять» −1, «оспорить» — 50/50 на +3 / −3. */
export function applyVar(
  state: PlayerState,
  contest: boolean,
  random: () => number = Math.random,
): CellOutcome {
  if (!contest) {
    const next = moveBy(state, -1);
    return moved('09', state, state.position, next, 'Судью не стали оспаривать: минус 1 клетка.');
  }
  const lucky = random() < 0.5;
  const delta = lucky ? 3 : -3;
  const next = moveBy(state, delta);
  return moved(
    '09',
    state,
    state.position,
    next,
    lucky ? 'VAR в твою пользу: плюс 3 клетки!' : 'VAR не помог: минус 3 клетки.',
  );
}

/** Голевая передача: получатель шагает +1, событие его клетки не срабатывает. */
export function applyPassage(
  giver: PlayerState,
  receiver: PlayerState,
  given: boolean,
): { giver: PlayerState; receiver: PlayerState; delta: number } {
  if (!given) return { giver, receiver, delta: 0 };
  const nextReceiver = moveBy(receiver, 1);
  return { giver, receiver: nextReceiver, delta: nextReceiver.position - receiver.position };
}

/** Раздевалка: снять выбранный негатив, либо +1, если негатива нет. */
export function applyLocker(state: PlayerState, remove: EffectCode | 'advance'): CellOutcome {
  if (remove === 'advance' || !NEGATIVE_EFFECTS.includes(remove)) {
    const next = moveBy(state, 1);
    return moved('07', state, state.position, next, 'В раздевалке делать нечего: шаг вперёд.');
  }
  return base('07', removeEffect(state, remove), 'Раздевалка: плохой эффект снят.');
}

/** Тактика: сдвиг уже сохранённого значения броска. */
export function applyTactics(value: number, delta: number): number {
  return Math.min(LAST_CELL, Math.max(1, value + delta));
}

/** Разбор активных эффектов для UI: что висит и сколько осталось. */
export function describeEffects(state: PlayerState): Array<{ code: EffectCode; label: string; charges: number }> {
  const labels: Record<EffectCode, string> = {
    tribuny: 'Домашние трибуны',
    gazon: 'Скользкий газон',
    shieldki: 'Щитки',
    yellow_card: 'Жёлтая карточка',
    tactics: 'Тактическая схема',
    press_trap: 'Прессинг-ловушка',
    dirty_time: 'Грязное время',
    broken_boot: 'Сломанный бутс',
    tribune_panic: 'Паника на трибунах',
    second_breath: 'Суперзамена: +2',
  };
  return state.effects
    .filter((e) => e.charges > 0)
    .map((e) => ({ code: e.code, label: labels[e.code], charges: e.charges }));
}
