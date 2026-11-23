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
  | 'second_breath'
  | 'cursed_boot';

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
  'cursed_boot',
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
  cursedBoot: boolean;
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
    cursedBoot: hasEffect(state, 'cursed_boot'),
  };
  let next = state;
  if (mods.tribuny) next = spendCharge(next, 'tribuny');
  if (mods.gazon) next = spendCharge(next, 'gazon');
  if (mods.secondBreath) next = spendCharge(next, 'second_breath');
  if (mods.pressTrap) next = spendCharge(next, 'press_trap');
  if (mods.brokenBoot) next = spendCharge(next, 'broken_boot');
  if (mods.tribunePanic) next = spendCharge(next, 'tribune_panic');
  if (mods.dirtyTime) next = spendCharge(next, 'dirty_time');
  if (mods.cursedBoot) next = spendCharge(next, 'cursed_boot');
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
  | 'attack_break'
  | 'last_minute'
  | 'rematch'
  | 'simulation'
  | 'gentleman'
  | 'training_base'
  | 'guess_player'
  | 'fan_sector'
  | 'coach_contract';

export type SideEffect =
  | { kind: 'move_all_others'; delta: number; minPosition?: number }
  | { kind: 'buff_all'; effectCode: EffectCode; charges: number }
  | { kind: 'move_nearest_ahead'; delta: number; fallbackSelfDelta: number }
  | { kind: 'move_target'; delta: number; targetProfileId?: string }
  | { kind: 'random_chaos'; penalty: number; bonus: number };

export type CellOutcome = {
  state: PlayerState;
  /** Код механики, если событие было. */
  code: string | null;
  /** Численное смещение, уже применённое к state. */
  delta: number;
  /** Что помешало эффекту. */
  preventedBy: 'shieldki' | 'yellow_card' | null;
  /** Поглощённый эффект (для показа в логах). */
  absorbed: EffectCode | null;
  /** Если нужен выбор игрока - какой. */
  awaiting: CellChoice | null;
  /** Мульти-игроковые/отложенные эффекты для tx-слоя. */
  sideEffects?: SideEffect[];
  /** Запись в журнал активности. */
  log: string;
};

export type LastMinuteResolution =
  | { done: true; outcome: CellOutcome }
  | { done: false; stage: 2; currentReward: 3; log: string };

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

    case '11':
      return {
        ...base(code, state, `Тренировочная база: ${who} получает 3 удара. Нужно минимум 2 попадания для +2 клеток.`),
        awaiting: 'training_base',
      };

    case '12':
      return {
        ...base(code, state, `Узнай футболиста: ${who} может открыть подсказки и дать один ответ.`),
        awaiting: 'guess_player',
      };

    case '13':
      return {
        ...base(code, state, `Фан-сектор: ${who} получил задание. Выполнение подтверждается админом.`),
        awaiting: 'fan_sector',
      };

    case '14':
      return {
        ...base(code, state, `Ответный матч: ${who} может вызвать соперника на серию пенальти. Отказ не считается поражением.`),
        awaiting: 'rematch',
      };

    case '15':
      return {
        ...base(code, state, `Последняя минута: ${who} на старте +1. Можно забрать или рискнуть за +3 (60%) / 0 (40%).`),
        awaiting: 'last_minute',
      };

    case '16':
      return {
        ...base(code, state, `Симуляция: ${who} выбирает соперника-судью. Решения раскроются после фиксации обоих.`),
        awaiting: 'simulation',
      };

    case '17':
      return {
        ...base(code, state, `Контракт тренера: ${who} может подписать обязательство на следующий игровой день.`),
        awaiting: 'coach_contract',
      };

    case '18':
      return {
        ...base(code, state, `Джентльменское соглашение: ${who} может предложить дуэль доверия. Ожидание не блокирует ход.`),
        awaiting: 'gentleman',
      };

    case '21':
      return { ...base(code, state, `Пенальти: ${who} выбирает удар или пас.`), awaiting: 'penalty' };

    case '22': {
      if (hasEffect(state, 'shieldki')) {
        return {
          ...base(code, spendCharge(state, 'shieldki'), `«Щитки» спасли ${who} от прессинг-ловушки.`),
          preventedBy: 'shieldki',
        };
      }
      return base(code, addEffect(state, 'press_trap', 1), `Прессинг-ловушка: следующий бросок ${who} получит -2 (мин. 1).`);
    }

    case '23':
      return { ...base(code, state, `Дриблинг: ${who} выбирает обыграть или сбросить.`), awaiting: 'dribble' };

    case '24': {
      if (hasEffect(state, 'shieldki')) {
        return {
          ...base(code, spendCharge(state, 'shieldki'), `«Щитки» спасли ${who} от автогола.`),
          preventedBy: 'shieldki',
        };
      }
      const next = moveBy(state, -3);
      return moved(code, state, state.position, next, `Автогол! ${who} откатывается на 3 клетки назад.`);
    }

    case '25': {
      if (hasEffect(state, 'shieldki')) {
        return {
          ...base(code, spendCharge(state, 'shieldki'), `«Щитки» спасли ${who} от грязного времени.`),
          preventedBy: 'shieldki',
        };
      }
      return base(code, addEffect(state, 'dirty_time', 1), `Грязное время: следующий бросок ${who} ограничен до 3.`);
    }

    case '26': {
      if (hasEffect(state, 'shieldki')) {
        return {
          ...base(code, spendCharge(state, 'shieldki'), `«Щитки» спасли ${who} от сломанного бутса.`),
          preventedBy: 'shieldki',
        };
      }
      return base(code, addEffect(state, 'broken_boot', 2), `Сломанный бутс: ${who} получит -1 на 2 следующих броска.`);
    }

    case '27':
      return { ...base(code, state, `Суперзамена: ${who} выбирает усиление.`), awaiting: 'super_sub' };

    case '28':
      return { ...base(code, state, `Угловой розыгрыш: ${who} выбирает вариант.`), awaiting: 'corner' };

    case '29':
      return { ...base(code, state, `Фол в штрафной: ${who} выбирает, как сыграть.`), awaiting: 'foul' };

    case '30': {
      const lucky = random() >= 0.6;
      const delta = lucky ? 2 : -2;
      const next = moveBy(state, delta);
      return moved(
        code,
        state,
        state.position,
        next,
        lucky
          ? `VAR проверил эпизод: гол засчитан. ${who} получает +2 клетки.`
          : `VAR проверил эпизод: офсайд. ${who} откатывается на 2 клетки.`,
      );
    }

    case '31':
      return {
        ...base(code, state, `Массовый офсайд: соперники ${who} откатываются на 2 клетки.`),
        sideEffects: [{ kind: 'move_all_others', delta: -2, minPosition: 1 }],
      };

    case '32': {
      // Global debuff: applies to everyone including self. No shield auto-spend for others; self also not shielded (chaos/global).
      const nextState = addEffect(state, 'tribune_panic', 1);
      return {
        ...base(code, nextState, `Паника на трибунах: все игроки получат -1 к следующему броску.`),
        sideEffects: [{ kind: 'buff_all', effectCode: 'tribune_panic', charges: 1 }],
      };
    }

    case '33':
      return { ...base(code, state, `Красный VAR: ${who} выбирает соперника для рискованной атаки.`), awaiting: 'red_var' };

    case '34':
      return { ...base(code, state, `Срыв атаки: ${who} выбирает соперника впереди.`), awaiting: 'attack_break' };

    case '35':
      return {
        ...base(code, state, `Метеорит на стадионе: случайный хаос обрушивается на поле.`),
        sideEffects: [{ kind: 'random_chaos', penalty: -3, bonus: 2 }],
      };

    case '36': {
      const negatives = state.effects.filter((e) => NEGATIVE_EFFECTS.includes(e.code) && e.charges > 0);
      if (negatives.length > 0) {
        let nextState = state;
        for (const effect of negatives) nextState = removeEffect(nextState, effect.code);
        return base(code, nextState, `Бутылка с водой: ${who} снял все негативные эффекты.`);
      }
      const next = moveBy(state, 2);
      return moved(code, state, state.position, next, `Бутылка с водой: снимать нечего, ${who} получает +2 клетки.`);
    }

    case '37':
      return {
        ...base(code, state, `${who} запустил подножку: ближайший соперник впереди откатится на 2 клетки.`),
        sideEffects: [{ kind: 'move_nearest_ahead', delta: -2, fallbackSelfDelta: 1 }],
      };

    case '19':
      return {
        ...base(code, state, `${who} может выбрать пак: Сборные или Клубы.`),
        awaiting: 'pack_choice',
      };

    case '20':
      return base(
        code,
        addEffect(state, 'cursed_boot', 1),
        `Проклятая бутса: следующий бросок ${who} уйдёт случайному сопернику.`,
      );

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

export function applyLastMinute(
  state: PlayerState,
  choice: 'stop' | 'continue',
  stage: 1 | 2,
  currentReward: 1 | 3,
  random: () => number = Math.random,
): LastMinuteResolution {
  if (choice === 'stop') {
    const delta = currentReward;
    if (delta > 0) {
      const next = moveBy(state, delta);
      return {
        done: true,
        outcome: moved('15', state, state.position, next, `Последняя минута: забираешь +${delta} ${delta === 1 ? 'клетку' : 'клетки'}.`),
      };
    }
    return { done: true, outcome: base('15', state, 'Последняя минута: награда события — 0, остаёшься на месте.') };
  }

  if (stage === 1) {
    if (random() < 0.6) {
      return {
        done: false,
        stage: 2,
        currentReward: 3,
        log: 'Последняя минута: риск оправдался! Сейчас на кону +3. Можно забрать или рискнуть за +5 (40%) / 0 (60%).',
      };
    }
    return { done: true, outcome: base('15', state, 'Последняя минута: риск не сыграл, награда события обнуляется.') };
  }

  if (random() < 0.4) {
    const next = moveBy(state, 5);
    return {
      done: true,
      outcome: moved('15', state, state.position, next, 'Последняя минута: вау! Забираешь +5 клеток.'),
    };
  }
  return { done: true, outcome: base('15', state, 'Последняя минута: финальный риск не сыграл, награда события обнуляется.') };
}

export function applyPenalty(
  state: PlayerState,
  choice: 'shoot' | 'pass',
  random: () => number = Math.random,
): CellOutcome {
  if (choice === 'pass') {
    const next = moveBy(state, 1);
    return moved('21', state, state.position, next, 'Пенальти: пас принят, +1 клетка.');
  }
  const goal = random() < 0.7;
  if (!goal) return base('21', state, 'Пенальти: промах. Ты остался на месте.');
  const next = moveBy(state, 3);
  return moved('21', state, state.position, next, 'Пенальти: гол! +3 клетки.');
}

export function applyDribble(
  state: PlayerState,
  choice: 'beat' | 'pass',
  random: () => number = Math.random,
): CellOutcome {
  if (choice === 'pass') {
    const next = moveBy(state, 1);
    return moved('23', state, state.position, next, 'Дриблинг: сбросил мяч, +1 клетка.');
  }
  const ok = random() < 0.6;
  const delta = ok ? 2 : -1;
  const next = moveBy(state, delta);
  return moved('23', state, state.position, next, ok ? 'Дриблинг: обыграл! +2 клетки.' : 'Дриблинг: потеря, -1 клетка.');
}

export function applySuperSub(
  state: PlayerState,
  choice: 'buff' | 'shield',
): CellOutcome {
  if (choice === 'buff') {
    return base('27', addEffect(state, 'second_breath', 1), 'Суперзамена: +2 к следующему броску.');
  }
  if (hasEffect(state, 'shieldki')) {
    const next = moveBy(state, 1);
    return moved('27', state, state.position, next, 'Суперзамена: щиток уже есть, получаешь +1 клетку.');
  }
  return base('27', addEffect(state, 'shieldki', 1), 'Суперзамена: получен щиток.');
}

export function applyCorner(
  state: PlayerState,
  choice: 'simple' | 'risky',
  random: () => number = Math.random,
): CellOutcome {
  if (choice === 'simple') {
    const next = moveBy(state, 1);
    return moved('28', state, state.position, next, 'Угловой: простой розыгрыш, +1 клетка.');
  }
  const win = random() < 0.5;
  const delta = win ? 3 : -1;
  const next = moveBy(state, delta);
  return moved('28', state, state.position, next, win ? 'Угловой: голевой розыгрыш! +3 клетки.' : 'Угловой: неудача, -1 клетка.');
}

export function applyFoul(
  state: PlayerState,
  choice: 'defend' | 'dispute',
  random: () => number = Math.random,
): CellOutcome {
  if (choice === 'defend') {
    const next = moveBy(state, -1);
    return moved('29', state, state.position, next, 'Фол в штрафной: защита выбрана, -1 клетка.');
  }
  const bad = random() >= 0.5;
  if (!bad) return base('29', state, 'Фол в штрафной: спор прошёл, последствий нет.');
  const next = moveBy(state, -3);
  return moved('29', state, state.position, next, 'Фол в штрафной: спор не удался, -3 клетки.');
}

export function applyRedVar(
  state: PlayerState,
  random: () => number = Math.random,
): CellOutcome {
  const hit = random() < 0.5;
  if (hit) {
    return {
      ...base('33', state, 'Красный VAR: удар прошёл, соперник получает -3 клетки.'),
      sideEffects: [{ kind: 'move_target', delta: -3 }],
    };
  }
  const next = moveBy(state, -2);
  return moved('33', state, state.position, next, 'Красный VAR: неудача, ты получаешь -2 клетки.');
}

export function applyAttackBreak(
  state: PlayerState,
  hasTarget: boolean,
): CellOutcome {
  if (hasTarget) {
    return {
      ...base('34', state, 'Срыв атаки: соперник впереди откатывается на 2 клетки.'),
      sideEffects: [{ kind: 'move_target', delta: -2 }],
    };
  }
  const next = moveBy(state, 1);
  return moved('34', state, state.position, next, 'Срыв атаки: впереди никого нет, +1 клетка.');
}

export type SimulationChoice = 'honest' | 'simulate';
export type JudgeChoice = 'play_on' | 'check';

export function resolveSimulation(
  attackerChoice: SimulationChoice,
  judgeChoice: JudgeChoice,
): { attackerDelta: number; judgeDelta: number; log: string } {
  if (attackerChoice === 'honest' && judgeChoice === 'play_on') {
    return { attackerDelta: 1, judgeDelta: 0, log: 'Симуляция: честная игра, судья не проверял. Атакующий +1.' };
  }
  if (attackerChoice === 'simulate' && judgeChoice === 'play_on') {
    return { attackerDelta: 3, judgeDelta: 0, log: 'Симуляция: нарушение прошло без проверки. Атакующий +3.' };
  }
  if (attackerChoice === 'simulate' && judgeChoice === 'check') {
    return { attackerDelta: -2, judgeDelta: 1, log: 'Симуляция: судья проверил симуляцию. Атакующий -2, судья +1.' };
  }
  return { attackerDelta: 1, judgeDelta: -1, log: 'Симуляция: судья проверил честного игрока. Атакующий +1, судья -1.' };
}

export type GentlemanChoice = 'cooperate' | 'take';

export function resolveGentleman(
  initiatorChoice: GentlemanChoice,
  partnerChoice: GentlemanChoice,
): { initiatorDelta: number; partnerDelta: number; log: string } {
  if (initiatorChoice === 'cooperate' && partnerChoice === 'cooperate') {
    return { initiatorDelta: 2, partnerDelta: 2, log: 'Джентльменское соглашение: оба сыграли честно. Каждому +2.' };
  }
  if (initiatorChoice === 'take' && partnerChoice === 'cooperate') {
    return { initiatorDelta: 3, partnerDelta: -1, log: 'Джентльменское соглашение: инициатор забрал себе. Ему +3, партнёру -1.' };
  }
  if (initiatorChoice === 'cooperate' && partnerChoice === 'take') {
    return { initiatorDelta: -1, partnerDelta: 3, log: 'Джентльменское соглашение: партнёр забрал себе. Партнёру +3, инициатору -1.' };
  }
  return { initiatorDelta: -1, partnerDelta: -1, log: 'Джентльменское соглашение: оба забрали себе. Каждому -1.' };
}

export type RematchDirection = 'left' | 'center' | 'right';

export type RematchKick = {
  round: number;
  attacker: 'initiator' | 'partner';
  initiatorPick?: RematchDirection;
  partnerPick?: RematchDirection;
  goal?: boolean;
};

export type RematchState = {
  round: number;
  initiatorScore: number;
  partnerScore: number;
  kicks: RematchKick[];
  done: boolean;
  winner: 'initiator' | 'partner' | null;
};

export function rematchAttacker(round: number): 'initiator' | 'partner' {
  // 4 base rounds (2 kicks each), then sudden death pairs: 5,6,7,8...
  // Odd rounds: initiator attacks; even rounds: partner attacks.
  return round % 2 === 1 ? 'initiator' : 'partner';
}

export function applyRematchKick(
  state: RematchState,
  initiatorPick: RematchDirection,
  partnerPick: RematchDirection,
): RematchState {
  const attacker = rematchAttacker(state.round);
  const attackPick = attacker === 'initiator' ? initiatorPick : partnerPick;
  const keepPick = attacker === 'initiator' ? partnerPick : initiatorPick;
  const goal = attackPick !== keepPick;
  const initiatorScore = state.initiatorScore + (goal && attacker === 'initiator' ? 1 : 0);
  const partnerScore = state.partnerScore + (goal && attacker === 'partner' ? 1 : 0);
  const kicks = [...state.kicks, { round: state.round, attacker, initiatorPick, partnerPick, goal }];
  const round = state.round;

  let done = false;
  let winner: 'initiator' | 'partner' | null = null;

  // Fairness: decide at the end of a pair (even round), in base (4) or sudden death (6,8,...)
  if (round % 2 === 0 && round >= 4) {
    if (initiatorScore !== partnerScore) {
      done = true;
      winner = initiatorScore > partnerScore ? 'initiator' : 'partner';
    }
  }

  // Safety cap to avoid infinite state machine
  if (!done && round >= 12) {
    done = true;
    winner = initiatorScore >= partnerScore ? 'initiator' : 'partner';
  }

  return {
    round: done ? round : round + 1,
    initiatorScore,
    partnerScore,
    kicks,
    done,
    winner,
  };
}

export function initialRematchState(): RematchState {
  return { round: 1, initiatorScore: 0, partnerScore: 0, kicks: [], done: false, winner: null };
}

export type TrainingShot = { round: number; hit: boolean };
export type TrainingBaseState = { round: number; hits: number; shots: TrainingShot[]; done: boolean };

export function initialTrainingBaseState(): TrainingBaseState {
  return { round: 1, hits: 0, shots: [], done: false };
}

export function applyTrainingShot(state: TrainingBaseState, random: () => number = Math.random): TrainingBaseState {
  if (state.done || state.round > 3) return state;
  const hit = random() < 0.5;
  const hits = state.hits + (hit ? 1 : 0);
  const shots = [...state.shots, { round: state.round, hit }];
  const round = state.round + 1;
  const done = round > 3 || hits >= 2; // early finish if 2 hits already? 3 shots total available; 2 hits wins
  // Spec: 3 удара, 2 попадания -> +2. If 2 hits in first 2, third not needed but harmless; we'll end early.
  return { round: done ? state.round : round, hits, shots, done };
}

export function trainingBaseReward(hits: number): number {
  return hits >= 2 ? 2 : 0;
}

export type GuessRiddle = {
  id: string;
  clues: [string, string, string, string]; // position, country, former club, current team
  answer: string;
  acceptedAnswers: string[];
};

export const GUESS_PLAYER_RIDDLES: readonly GuessRiddle[] = [
  { id: 'gp1', clues: ['Нападающий', 'Аргентина', 'Барселона', 'Интер Майами'], answer: 'Месси', acceptedAnswers: ['месси', 'lionel messi', 'leo messi'] },
  { id: 'gp2', clues: ['Нападающий', 'Португалия', 'Реал Мадрид', 'Аль-Наср'], answer: 'Роналду', acceptedAnswers: ['роналду', 'cristiano ronaldo', 'cr7'] },
  { id: 'gp3', clues: ['Нападающий', 'Франция', 'ПСЖ', 'Реал Мадрид'], answer: 'Мбаппе', acceptedAnswers: ['мбаппе', 'kylian mbappe', 'mbappe'] },
  { id: 'gp4', clues: ['Полузащитник', 'Бельгия', 'Челси', 'Манчестер Сити'], answer: 'Де Брёйне', acceptedAnswers: ['де брейне', 'де брёйне', 'kevin de bruyne', 'de bruyne'] },
  { id: 'gp5', clues: ['Нападающий', 'Норвегия', 'Боруссия Дортмунд', 'Манчестер Сити'], answer: 'Холанд', acceptedAnswers: ['холанд', 'erling haaland', 'haaland'] },
] as const;

export function normalizeGuessAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGuessCorrect(guess: string, riddle: Pick<GuessRiddle, 'acceptedAnswers'>): boolean {
  const n = normalizeGuessAnswer(guess);
  return riddle.acceptedAnswers.some((a) => normalizeGuessAnswer(a) === n);
}

export function guessPlayerReward(cluesRevealed: number): number {
  // 1 clue revealed -> +4, 2 -> +3, 3 -> +2, 4 -> +1
  if (cluesRevealed <= 1) return 4;
  if (cluesRevealed === 2) return 3;
  if (cluesRevealed === 3) return 2;
  return 1;
}
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
    cursed_boot: 'Проклятая бутса',
  };
  return state.effects
    .filter((e) => e.charges > 0)
    .map((e) => ({ code: e.code, label: labels[e.code], charges: e.charges }));
}
