import { describe, expect, it } from 'vitest';
import {
  addEffect,
  applyLocker,
  applyPassage,
  applyTactics,
  applyCorner,
  applyDribble,
  applyFoul,
  applyPenalty,
  applySuperSub,
  applyAttackBreak,
  applyLastMinute,
  applyRedVar,
  applyVar,
  initialRematchState,
  applyRematchKick,
  resolveGentleman,
  resolveSimulation,
  initialTrainingBaseState,
  applyTrainingShot,
  trainingBaseReward,
  normalizeGuessAnswer,
  isGuessCorrect,
  guessPlayerReward,
  describeEffects,
  effectCharges,
  hasEffect,
  makePlayer,
  moveBy,
  resolveCell,
  NEGATIVE_EFFECTS,
  takeRollModifiers,
} from '@/lib/game/engine';
import { applyRollModifiers } from '@/lib/game/dice';

const never = () => 0; // всегда «повезло» (< 0.5)
const always = () => 0.99; // всегда «не повезло»

describe('движение', () => {
  it('контратака даёт +3', () => {
    const out = resolveCell(makePlayer(10), '01', 'Марк');
    expect(out.state.position).toBe(13);
    expect(out.delta).toBe(3);
  });

  it('от +3 событие новой клетки не запускается (нет второй записи)', () => {
    const out = resolveCell(makePlayer(10), '01', 'Марк');
    expect(out.code).toBe('01');
    expect(out.awaiting).toBeNull();
    expect(out.state.effects).toHaveLength(0);
  });

  it('офсайд откатывает на 2', () => {
    const out = resolveCell(makePlayer(10), '02', 'Марк');
    expect(out.state.position).toBe(8);
    expect(out.delta).toBe(-2);
  });

  it('не уходит ниже клетки 1', () => {
    expect(moveBy(makePlayer(2), -5).position).toBe(1);
    expect(moveBy(makePlayer(1), -1).position).toBe(1);
    expect(resolveCell(makePlayer(1), '02', 'Марк').state.position).toBe(1);
  });

  it('на 80 ставит флаг финиша и не уходит дальше', () => {
    const out = moveBy(makePlayer(78), 5);
    expect(out.position).toBe(80);
    expect(out.finished).toBe(true);
  });

  it('бросок на финишной клетке остаётся на 80', () => {
    expect(moveBy(makePlayer(80), 3).position).toBe(80);
  });
});

describe('Щитки', () => {
  it('отменяют офсайд и расходуются', () => {
    const state = addEffect(makePlayer(10), 'shieldki', 1);
    const out = resolveCell(state, '02', 'Марк');
    expect(out.state.position).toBe(10);
    expect(out.preventedBy).toBe('shieldki');
    expect(hasEffect(out.state, 'shieldki')).toBe(false);
  });

  it('отменяют получение газона', () => {
    const state = addEffect(makePlayer(10), 'shieldki', 1);
    const out = resolveCell(state, '04', 'Марк');
    expect(hasEffect(out.state, 'gazon')).toBe(false);
    expect(out.preventedBy).toBe('shieldki');
  });

  it('отменяют жёлтую карточку', () => {
    const state = addEffect(makePlayer(10), 'shieldki', 1);
    const out = resolveCell(state, '08', 'Марк');
    expect(hasEffect(out.state, 'yellow_card')).toBe(false);
    expect(out.preventedBy).toBe('shieldki');
  });

  it('не лечат уже висящий газон', () => {
    const state = addEffect(addEffect(makePlayer(10), 'gazon', 1), 'shieldki', 1);
    const out = resolveCell(state, '01', 'Марк');
    expect(hasEffect(out.state, 'gazon')).toBe(true);
    expect(hasEffect(out.state, 'shieldki')).toBe(true);
  });

  it('не защищают от VAR', () => {
    const state = addEffect(makePlayer(10), 'shieldki', 1);
    const out = applyVar(state, true, always);
    expect(out.state.position).toBe(7);
    expect(hasEffect(out.state, 'shieldki')).toBe(true);
  });

  it('повторно не создают запас', () => {
    const state = addEffect(makePlayer(10), 'shieldki', 1);
    const out = resolveCell(state, '06', 'Марк');
    expect(effectCharges(out.state, 'shieldki')).toBe(1);
  });
});

describe('Жёлтая карточка', () => {
  it('поглощает Трибуны и исчезает', () => {
    const state = addEffect(makePlayer(10), 'yellow_card', 1);
    const out = resolveCell(state, '05', 'Марк');
    expect(hasEffect(out.state, 'tribuny')).toBe(false);
    expect(hasEffect(out.state, 'yellow_card')).toBe(false);
    expect(out.absorbed).toBe('yellow_card');
  });

  it('поглощает Тактику', () => {
    const state = addEffect(makePlayer(10), 'yellow_card', 1);
    const out = resolveCell(state, '10', 'Марк');
    expect(out.awaiting).toBeNull();
    expect(hasEffect(out.state, 'tactics')).toBe(false);
  });

  it('не выключает эффект, полученный до неё', () => {
    const state = addEffect(makePlayer(10), 'tribuny', 2);
    const afterCard = resolveCell(state, '08', 'Марк').state;
    expect(hasEffect(afterCard, 'tribuny')).toBe(true);
    expect(hasEffect(afterCard, 'yellow_card')).toBe(true);
  });
});

describe('Скользкий газон', () => {
  it('повторно не даёт −2', () => {
    const once = resolveCell(makePlayer(10), '04', 'Марк').state;
    const twice = resolveCell(once, '04', 'Марк').state;
    expect(effectCharges(twice, 'gazon')).toBe(1);
  });

  it('расходуется на броске', () => {
    const state = addEffect(makePlayer(10), 'gazon', 1);
    const { state: after, mods } = takeRollModifiers(state);
    expect(mods.gazon).toBe(true);
    expect(hasEffect(after, 'gazon')).toBe(false);
  });
});

describe('Трибуны', () => {
  it('дают +1 на два броска', () => {
    let state = addEffect(makePlayer(10), 'tribuny', 2);
    const first = takeRollModifiers(state);
    expect(first.mods.tribuny).toBe(true);
    expect(effectCharges(first.state, 'tribuny')).toBe(1);

    const second = takeRollModifiers(first.state);
    expect(second.mods.tribuny).toBe(true);
    expect(hasEffect(second.state, 'tribuny')).toBe(false);
  });

  it('повторное получение восстанавливает заряд до 2, а не суммирует', () => {
    const state = addEffect(addEffect(makePlayer(10), 'tribuny', 1), 'tribuny', 2);
    expect(effectCharges(state, 'tribuny')).toBe(2);
  });

  it('Трибуны и Газон вместе оба расходуются', () => {
    const state = addEffect(addEffect(makePlayer(10), 'tribuny', 2), 'gazon', 1);
    const { mods, state: after } = takeRollModifiers(state);
    expect(mods).toMatchObject({ tribuny: true, gazon: true });
    expect(hasEffect(after, 'tribuny')).toBe(true);
    expect(hasEffect(after, 'gazon')).toBe(false);
  });
});

describe('Раздевалка', () => {
  it('снимает выбранный негатив', () => {
    const state = addEffect(addEffect(makePlayer(10), 'gazon', 1), 'yellow_card', 1);
    const out = applyLocker(state, 'gazon');
    expect(hasEffect(out.state, 'gazon')).toBe(false);
    expect(hasEffect(out.state, 'yellow_card')).toBe(true);
    expect(out.delta).toBe(0);
  });

  it('без негатива даёт +1', () => {
    const out = applyLocker(makePlayer(10), 'advance');
    expect(out.state.position).toBe(11);
    expect(out.delta).toBe(1);
  });

  it('ждёт выбора, если негатив есть', () => {
    const state = addEffect(makePlayer(10), 'gazon', 1);
    const out = resolveCell(state, '07', 'Марк');
    expect(out.awaiting).toBe('locker');
    expect(out.state.position).toBe(10);
  });
});

describe('VAR', () => {
  it('«принять» — минус одна клетка', () => {
    const out = applyVar(makePlayer(10), false);
    expect(out.state.position).toBe(9);
  });

  it('«оспорить» — плюс три при удаче', () => {
    expect(applyVar(makePlayer(10), true, never).state.position).toBe(13);
  });

  it('«оспорить» — минус три при неудаче', () => {
    expect(applyVar(makePlayer(10), true, always).state.position).toBe(7);
  });

  it('ждёт выбора', () => {
    expect(resolveCell(makePlayer(10), '09', 'Марк').awaiting).toBe('var');
  });
});

describe('Тактическая схема', () => {
  it('сдвигает сохранённое значение', () => {
    expect(applyTactics(4, 1)).toBe(5);
    expect(applyTactics(4, 0)).toBe(4);
    expect(applyTactics(4, -1)).toBe(3);
  });

  it('не опускает ниже 1', () => {
    expect(applyTactics(1, -1)).toBe(1);
  });

  it('выдаёт эффект тактики, а не ждёт выбора на месте', () => {
    const out = resolveCell(makePlayer(10), '10', 'Марк');
    expect(out.state.effects).toEqual([{ code: 'tactics', charges: 1 }]);
    expect(out.awaiting).toBeNull();
  });
});

describe('Голевая передача', () => {
  it('получатель шагает на +1, дающий стоит', () => {
    const giver = makePlayer(20);
    const receiver = makePlayer(30);
    const result = applyPassage(giver, receiver, true);
    expect(result.giver.position).toBe(20);
    expect(result.receiver.position).toBe(31);
    expect(result.delta).toBe(1);
  });

  it('можно остаться на месте', () => {
    const result = applyPassage(makePlayer(20), makePlayer(30), false);
    expect(result.receiver.position).toBe(30);
    expect(result.delta).toBe(0);
  });

  it('получатель на финише не уезжает за 80', () => {
    expect(applyPassage(makePlayer(10), makePlayer(80), true).receiver.position).toBe(80);
  });
});

describe('описание эффектов', () => {
  it('отдаёт подписи и заряды', () => {
    const state = addEffect(addEffect(makePlayer(10), 'tribuny', 2), 'gazon', 1);
    expect(describeEffects(state)).toEqual([
      { code: 'tribuny', label: 'Домашние трибуны', charges: 2 },
      { code: 'gazon', label: 'Скользкий газон', charges: 1 },
    ]);
  });
});


describe('Phase 1 effect foundations', () => {
  it('treats new debuffs as negative effects', () => {
    for (const code of ['press_trap', 'dirty_time', 'broken_boot', 'tribune_panic'] as const) {
      expect(NEGATIVE_EFFECTS).toContain(code);
    }
    expect(NEGATIVE_EFFECTS).not.toContain('second_breath');
  });

  it('takeRollModifiers consumes second_breath as +2 buff', () => {
    const state = addEffect(makePlayer(10), 'second_breath', 1);
    const { mods, state: after } = takeRollModifiers(state);
    expect(mods).toMatchObject({ secondBreath: true });
    expect(hasEffect(after, 'second_breath')).toBe(false);
    expect(applyRollModifiers(3, mods).value).toBe(5);
  });

  it('press_trap gives -2 (min 1) for one roll', () => {
    const state = addEffect(makePlayer(10), 'press_trap', 1);
    const { mods, state: after } = takeRollModifiers(state);
    expect(mods).toMatchObject({ pressTrap: true });
    expect(hasEffect(after, 'press_trap')).toBe(false);
    expect(applyRollModifiers(3, mods).value).toBe(1);
    expect(applyRollModifiers(2, mods).value).toBe(1);
  });

  it('broken_boot gives -1 for two rolls', () => {
    let state = addEffect(makePlayer(10), 'broken_boot', 2);
    const first = takeRollModifiers(state);
    expect(first.mods).toMatchObject({ brokenBoot: true });
    expect(effectCharges(first.state, 'broken_boot')).toBe(1);
    expect(applyRollModifiers(4, first.mods).value).toBe(3);
    const second = takeRollModifiers(first.state);
    expect(second.mods).toMatchObject({ brokenBoot: true });
    expect(hasEffect(second.state, 'broken_boot')).toBe(false);
  });

  it('dirty_time caps 4+ to 3 for one roll', () => {
    const state = addEffect(makePlayer(10), 'dirty_time', 1);
    const { mods, state: after } = takeRollModifiers(state);
    expect(mods).toMatchObject({ dirtyTime: true });
    expect(hasEffect(after, 'dirty_time')).toBe(false);
    expect(applyRollModifiers(6, mods).value).toBe(3);
    expect(applyRollModifiers(4, mods).value).toBe(3);
    expect(applyRollModifiers(3, mods).value).toBe(3);
  });

  it('tribune_panic gives -1 for one roll', () => {
    const state = addEffect(makePlayer(10), 'tribune_panic', 1);
    const { mods, state: after } = takeRollModifiers(state);
    expect(mods).toMatchObject({ tribunePanic: true });
    expect(hasEffect(after, 'tribune_panic')).toBe(false);
    expect(applyRollModifiers(2, mods).value).toBe(1);
  });

  it('describeEffects labels new effect codes', () => {
    const state = [
      'press_trap', 'dirty_time', 'broken_boot', 'tribune_panic', 'second_breath',
    ].reduce((s, code) => addEffect(s, code as any, 1), makePlayer(10));
    const labels = describeEffects(state).map((e) => e.code);
    expect(labels).toEqual(expect.arrayContaining(['press_trap', 'dirty_time', 'broken_boot', 'tribune_panic', 'second_breath']));
  });
});


describe('Phase 1 cell 19 pack choice', () => {
  it('returns awaiting pack_choice with no movement', () => {
    const out = resolveCell(makePlayer(10), '19', '�����');
    expect(out.awaiting).toBe('pack_choice');
    expect(out.delta).toBe(0);
    expect(out.state.position).toBe(10);
    expect(out.log).toMatch(/�����|���/i);
  });
});


describe('Phase 1 simple instant mechanics', () => {
  it('24 Autogol: -3, shieldable, min cell 1', () => {
    const out = resolveCell(makePlayer(10), '24', 'Игрок');
    expect(out.state.position).toBe(7);
    expect(out.delta).toBe(-3);
    expect(out.awaiting).toBeNull();

    const shielded = resolveCell(addEffect(makePlayer(10), 'shieldki', 1), '24', 'Игрок');
    expect(shielded.preventedBy).toBe('shieldki');
    expect(shielded.state.position).toBe(10);
    expect(hasEffect(shielded.state, 'shieldki')).toBe(false);

    expect(resolveCell(makePlayer(2), '24', 'Игрок').state.position).toBe(1);
  });

  it('30 VAR offside check: 60% -2, 40% +2 by RNG', () => {
    const bad = resolveCell(makePlayer(10), '30', 'Игрок', () => 0.0); // < 0.6 => -2
    expect(bad.state.position).toBe(8);
    expect(bad.delta).toBe(-2);

    const good = resolveCell(makePlayer(10), '30', 'Игрок', () => 0.9); // >=0.6 => +2
    expect(good.state.position).toBe(12);
    expect(good.delta).toBe(2);
  });

  it('36 Water bottle: clears all negative debuffs, or +2 if none', () => {
    const debuffed = addEffect(addEffect(makePlayer(10), 'press_trap', 1), 'broken_boot', 2);
    const cleared = resolveCell(addEffect(debuffed, 'tribuny', 1), '36', 'Игрок');
    expect(cleared.state.position).toBe(10);
    expect(hasEffect(cleared.state, 'press_trap')).toBe(false);
    expect(hasEffect(cleared.state, 'broken_boot')).toBe(false);
    expect(hasEffect(cleared.state, 'tribuny')).toBe(true);

    const empty = resolveCell(makePlayer(10), '36', 'Игрок');
    expect(empty.state.position).toBe(12);
    expect(empty.delta).toBe(2);
  });

  it('37 Podnozhka: side effect targets nearest ahead, fallback self +1', () => {
    const out = resolveCell(makePlayer(10), '37', 'Игрок');
    expect(out.delta).toBe(0);
    expect(out.state.position).toBe(10);
    expect(out.sideEffects).toEqual([
      { kind: 'move_nearest_ahead', delta: -2, fallbackSelfDelta: 1 },
    ]);
  });
});


describe('Phase 1 debuff mechanics', () => {
  it('22 Press trap: -2 next roll debuff, shield blocks', () => {
    const out = resolveCell(makePlayer(10), '22', 'Игрок');
    expect(effectCharges(out.state, 'press_trap')).toBe(1);
    expect(out.delta).toBe(0);

    const shielded = resolveCell(addEffect(makePlayer(10), 'shieldki', 1), '22', 'Игрок');
    expect(shielded.preventedBy).toBe('shieldki');
    expect(hasEffect(shielded.state, 'press_trap')).toBe(false);
  });

  it('25 Dirty time: cap next roll to 3, shield blocks', () => {
    const out = resolveCell(makePlayer(10), '25', 'Игрок');
    expect(effectCharges(out.state, 'dirty_time')).toBe(1);

    const shielded = resolveCell(addEffect(makePlayer(10), 'shieldki', 1), '25', 'Игрок');
    expect(shielded.preventedBy).toBe('shieldki');
    expect(hasEffect(shielded.state, 'dirty_time')).toBe(false);
  });

  it('26 Broken boot: -1 for next 2 rolls, shield blocks', () => {
    const out = resolveCell(makePlayer(10), '26', 'Игрок');
    expect(effectCharges(out.state, 'broken_boot')).toBe(2);

    const shielded = resolveCell(addEffect(makePlayer(10), 'shieldki', 1), '26', 'Игрок');
    expect(shielded.preventedBy).toBe('shieldki');
    expect(hasEffect(shielded.state, 'broken_boot')).toBe(false);
  });

  it('32 Tribune panic: -1 next roll to everyone including self', () => {
    const out = resolveCell(makePlayer(10), '32', 'Игрок');
    expect(effectCharges(out.state, 'tribune_panic')).toBe(1);
    expect(out.sideEffects).toEqual([
      { kind: 'buff_all', effectCode: 'tribune_panic', charges: 1 },
    ]);
  });
});


describe('Phase 1 choice/risk mechanics', () => {
  it('21 Penalty: awaiting choice, shoot/pass outcomes', () => {
    const out = resolveCell(makePlayer(10), '21', 'Игрок');
    expect(out.awaiting).toBe('penalty');
    expect(out.delta).toBe(0);

    const goal = applyPenalty(makePlayer(10), 'shoot', () => 0.1);
    expect(goal.state.position).toBe(13);
    const miss = applyPenalty(makePlayer(10), 'shoot', () => 0.9);
    expect(miss.state.position).toBe(10);
    const pass = applyPenalty(makePlayer(10), 'pass', () => 0.9);
    expect(pass.state.position).toBe(11);
  });

  it('23 Dribble: awaiting choice, beat/pass outcomes', () => {
    const out = resolveCell(makePlayer(10), '23', 'Игрок');
    expect(out.awaiting).toBe('dribble');

    const beat = applyDribble(makePlayer(10), 'beat', () => 0.1);
    expect(beat.state.position).toBe(12);
    const fail = applyDribble(makePlayer(10), 'beat', () => 0.9);
    expect(fail.state.position).toBe(9);
    const pass = applyDribble(makePlayer(10), 'pass', () => 0.0);
    expect(pass.state.position).toBe(11);
  });

  it('27 Super sub: awaiting choice, buff or shield', () => {
    const out = resolveCell(makePlayer(10), '27', 'Игрок');
    expect(out.awaiting).toBe('super_sub');

    const buff = applySuperSub(makePlayer(10), 'buff');
    expect(effectCharges(buff.state, 'second_breath')).toBe(1);
    expect(buff.state.position).toBe(10);

    const shield = applySuperSub(makePlayer(10), 'shield');
    expect(effectCharges(shield.state, 'shieldki')).toBe(1);

    const hasShield = addEffect(makePlayer(10), 'shieldki', 1);
    const fallback = applySuperSub(hasShield, 'shield');
    expect(effectCharges(fallback.state, 'shieldki')).toBe(1);
    expect(fallback.state.position).toBe(11);
  });

  it('28 Corner: awaiting choice, simple/risky outcomes', () => {
    const out = resolveCell(makePlayer(10), '28', 'Игрок');
    expect(out.awaiting).toBe('corner');

    const simple = applyCorner(makePlayer(10), 'simple', () => 0.0);
    expect(simple.state.position).toBe(11);
    const win = applyCorner(makePlayer(10), 'risky', () => 0.1);
    expect(win.state.position).toBe(13);
    const lose = applyCorner(makePlayer(10), 'risky', () => 0.9);
    expect(lose.state.position).toBe(9);
  });

  it('29 Foul in box: awaiting choice, defend/dispute outcomes', () => {
    const out = resolveCell(makePlayer(10), '29', 'Игрок');
    expect(out.awaiting).toBe('foul');

    const defend = applyFoul(makePlayer(10), 'defend', () => 0.0);
    expect(defend.state.position).toBe(9);
    const nothing = applyFoul(makePlayer(10), 'dispute', () => 0.1);
    expect(nothing.state.position).toBe(10);
    const penalty = applyFoul(makePlayer(10), 'dispute', () => 0.9);
    expect(penalty.state.position).toBe(7);
  });
});


describe('Phase 1 global/target mechanics', () => {
  it('31 Mass offside: all others -2 via side effect', () => {
    const out = resolveCell(makePlayer(10), '31', 'Игрок');
    expect(out.delta).toBe(0);
    expect(out.state.position).toBe(10);
    expect(out.sideEffects).toEqual([{ kind: 'move_all_others', delta: -2, minPosition: 1 }]);
  });

  it('33 Red VAR: awaiting choice', () => {
    const out = resolveCell(makePlayer(10), '33', 'Игрок');
    expect(out.awaiting).toBe('red_var');
  });

  it('33 Red VAR resolve: 50% target -3, 50% self -2', () => {
    const hit = applyRedVar(makePlayer(10), () => 0.1); // <0.5 target hit
    expect(hit.sideEffects).toEqual([{ kind: 'move_target', delta: -3 }]);
    expect(hit.delta).toBe(0);
    const miss = applyRedVar(makePlayer(10), () => 0.9); // self -2
    expect(miss.state.position).toBe(8);
    expect(miss.delta).toBe(-2);
  });

  it('34 Attack break: awaiting choice', () => {
    const out = resolveCell(makePlayer(10), '34', 'Игрок');
    expect(out.awaiting).toBe('attack_break');
  });

  it('34 Attack break resolve: target -2 or self +1 fallback', () => {
    const hit = applyAttackBreak(makePlayer(10), true);
    expect(hit.sideEffects).toEqual([{ kind: 'move_target', delta: -2 }]);
    expect(hit.delta).toBe(0);
    const fallback = applyAttackBreak(makePlayer(10), false);
    expect(fallback.state.position).toBe(11);
    expect(fallback.delta).toBe(1);
  });

  it('35 Meteorite: random chaos side effect', () => {
    const out = resolveCell(makePlayer(10), '35', 'Игрок');
    expect(out.delta).toBe(0);
    expect(out.sideEffects).toEqual([{ kind: 'random_chaos', penalty: -3, bonus: 2 }]);
  });
});

describe('Mechanic 15 Last minute', () => {
  it('15: creates pending last_minute with no movement', () => {
    const out = resolveCell(makePlayer(20), '15', 'Тест');
    expect(out.awaiting).toBe('last_minute');
    expect(out.delta).toBe(0);
    expect(out.state.position).toBe(20);
    expect(out.log).toContain('Последняя минута');
  });

  it('15: stop at stage1 takes +1', () => {
    const res = applyLastMinute(makePlayer(20), 'stop', 1, 1, () => 0.0);
    expect(res.done).toBe(true);
    if (res.done) {
      expect(res.outcome.state.position).toBe(21);
      expect(res.outcome.delta).toBe(1);
    }
  });

  it('15: continue stage1 success moves to stage2 pending', () => {
    const res = applyLastMinute(makePlayer(20), 'continue', 1, 1, () => 0.59);
    expect(res).toEqual({ done: false, stage: 2, currentReward: 3, log: expect.any(String) });
  });

  it('15: continue stage1 fail resolves to 0', () => {
    const res = applyLastMinute(makePlayer(20), 'continue', 1, 1, () => 0.6);
    expect(res.done).toBe(true);
    if (res.done) {
      expect(res.outcome.state.position).toBe(20);
      expect(res.outcome.delta).toBe(0);
    }
  });

  it('15: continue stage2 success gives +5', () => {
    const res = applyLastMinute(makePlayer(20), 'continue', 2, 3, () => 0.39);
    expect(res.done).toBe(true);
    if (res.done) {
      expect(res.outcome.state.position).toBe(25);
      expect(res.outcome.delta).toBe(5);
    }
  });

  it('15: continue stage2 fail resolves to 0', () => {
    const res = applyLastMinute(makePlayer(20), 'continue', 2, 3, () => 0.4);
    expect(res.done).toBe(true);
    if (res.done) {
      expect(res.outcome.state.position).toBe(20);
      expect(res.outcome.delta).toBe(0);
    }
  });

  it('15: stop at stage2 takes current +3', () => {
    const res = applyLastMinute(makePlayer(20), 'stop', 2, 3, () => 0.0);
    expect(res.done).toBe(true);
    if (res.done) {
      expect(res.outcome.state.position).toBe(23);
      expect(res.outcome.delta).toBe(3);
    }
  });
});
describe('Mechanic 16 Simulation', () => {
  it('resolves all 4 matrix outcomes', () => {
    expect(resolveSimulation('honest', 'play_on')).toEqual({ attackerDelta: 1, judgeDelta: 0, log: expect.any(String) });
    expect(resolveSimulation('simulate', 'play_on')).toEqual({ attackerDelta: 3, judgeDelta: 0, log: expect.any(String) });
    expect(resolveSimulation('simulate', 'check')).toEqual({ attackerDelta: -2, judgeDelta: 1, log: expect.any(String) });
    expect(resolveSimulation('honest', 'check')).toEqual({ attackerDelta: 1, judgeDelta: -1, log: expect.any(String) });
  });
});

describe('Mechanic 18 Gentleman', () => {
  it('resolves all 4 outcomes', () => {
    expect(resolveGentleman('cooperate', 'cooperate')).toEqual({ initiatorDelta: 2, partnerDelta: 2, log: expect.any(String) });
    expect(resolveGentleman('take', 'cooperate')).toEqual({ initiatorDelta: 3, partnerDelta: -1, log: expect.any(String) });
    expect(resolveGentleman('cooperate', 'take')).toEqual({ initiatorDelta: -1, partnerDelta: 3, log: expect.any(String) });
    expect(resolveGentleman('take', 'take')).toEqual({ initiatorDelta: -1, partnerDelta: -1, log: expect.any(String) });
  });
});

describe('Mechanic 14 Rematch', () => {
  it('alternates attacker and scores goals on direction mismatch', () => {
    let s = initialRematchState();
    expect(s.round).toBe(1);
    s = applyRematchKick(s, 'left', 'right'); // r1 initiator attacks, different => goal initiator
    expect(s.initiatorScore).toBe(1);
    expect(s.partnerScore).toBe(0);
    expect(s.done).toBe(false);
    s = applyRematchKick(s, 'left', 'left'); // r2 partner attacks, same => no goal
    expect(s.partnerScore).toBe(0);
    expect(s.done).toBe(false);
  });

  it('finishes after 4 base rounds when score differs', () => {
    let s = initialRematchState();
    s = applyRematchKick(s, 'left', 'right'); // 1-0
    s = applyRematchKick(s, 'center', 'left'); // 1-1
    s = applyRematchKick(s, 'left', 'right'); // 2-1
    s = applyRematchKick(s, 'center', 'center'); // 2-1, round 4 pair end
    expect(s.done).toBe(true);
    expect(s.winner).toBe('initiator');
  });

  it('goes to sudden death and decides on pair end', () => {
    let s = initialRematchState();
    s = applyRematchKick(s, 'left', 'left'); // 0-0 r1
    s = applyRematchKick(s, 'left', 'left'); // 0-0 r2
    s = applyRematchKick(s, 'left', 'left'); // 0-0 r3
    s = applyRematchKick(s, 'left', 'left'); // 0-0 r4, tie
    expect(s.done).toBe(false);
    s = applyRematchKick(s, 'left', 'right'); // 1-0 r5 odd, mid-pair? r5 odd -> continue
    expect(s.done).toBe(false);
    s = applyRematchKick(s, 'center', 'center'); // r6 even, 1-0 -> initiator wins
    expect(s.done).toBe(true);
    expect(s.winner).toBe('initiator');
  });
});

describe('Mechanic 20 Cursed boot', () => {
  it('gives cursed_boot effect on landing', () => {
    const out = resolveCell(makePlayer(30), '20', 'Марк');
    expect(out.state.effects.some((e) => e.code === 'cursed_boot' && e.charges === 1)).toBe(true);
    expect(out.delta).toBe(0);
  });

  it('takeRollModifiers consumes cursed_boot', () => {
    const state = addEffect(makePlayer(30), 'cursed_boot', 1);
    const { mods, state: after } = takeRollModifiers(state);
    expect(mods.cursedBoot).toBe(true);
    expect(hasEffect(after, 'cursed_boot')).toBe(false);
  });
});

describe('Mechanic 11 Training base', () => {
  it('awards +2 for 2+ hits and 0 otherwise', () => {
    expect(trainingBaseReward(2)).toBe(2);
    expect(trainingBaseReward(3)).toBe(2);
    expect(trainingBaseReward(1)).toBe(0);
  });
  it('resolves 3 shots and can finish early on 2 hits', () => {
    let st = initialTrainingBaseState();
    st = applyTrainingShot(st, () => 0.1);
    st = applyTrainingShot(st, () => 0.1);
    expect(st.done).toBe(true);
    expect(st.hits).toBe(2);
  });
});

describe('Mechanic 12 Guess player', () => {
  it('normalizes answers and compares accepted forms', () => {
    expect(normalizeGuessAnswer('  МеССи!! ')).toBe('месси');
    expect(isGuessCorrect('Lionel Messi', { acceptedAnswers: ['месси', 'lionel messi'] })).toBe(true);
  });
  it('gives reward by revealed clues', () => {
    expect(guessPlayerReward(1)).toBe(4);
    expect(guessPlayerReward(2)).toBe(3);
    expect(guessPlayerReward(3)).toBe(2);
    expect(guessPlayerReward(4)).toBe(1);
  });
});
