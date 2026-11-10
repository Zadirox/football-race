import { describe, expect, it } from 'vitest';
import { makePlayer, type PlayerState } from '@/lib/game/engine';
import { applyTacticsChoice, keptEffects, planRoll } from '@/lib/game/roll';

/** Кубик, который всегда даёт максимум: random() = 0.999… */
const max = () => 0.999999;
/** Кубик, который всегда даёт единицу. */
const min = () => 0;

function withEffects(state: PlayerState, ...codes: Array<'tribuny' | 'gazon' | 'shieldki' | 'yellow_card' | 'tactics'>): PlayerState {
  return {
    ...state,
    effects: codes.map((code) => ({ code, charges: 1 })),
  };
}

describe('план броска', () => {
  it('на чистом состоянии отдаёт выпавшее значение', () => {
    const plan = planRoll(makePlayer(10), 'silver', max);
    expect(plan.base).toBe(4);
    expect(plan.value).toBe(4);
    expect(plan.needsTactics).toBe(false);
    expect(plan.state.effects).toEqual([]);
  });

  it('Трибуны добавляют единицу и расходуются', () => {
    const plan = planRoll(withEffects(makePlayer(10), 'tribuny'), 'bronze', max);
    expect(plan.base).toBe(3);
    expect(plan.value).toBe(4);
    expect(plan.state.effects).toEqual([]);
  });

  it('Газон отнимает единицу и расходуется', () => {
    const plan = planRoll(withEffects(makePlayer(10), 'gazon'), 'gold', max);
    expect(plan.base).toBe(6);
    expect(plan.value).toBe(5);
    expect(plan.state.effects).toEqual([]);
  });

  it('Трибуны и Газон гасят друг друга, но оба сгорают', () => {
    const plan = planRoll(withEffects(makePlayer(10), 'tribuny', 'gazon'), 'bronze', max);
    expect(plan.value).toBe(3);
    expect(plan.state.effects).toEqual([]);
  });

  it('итог не опускается ниже единицы', () => {
    const plan = planRoll(withEffects(makePlayer(10), 'gazon'), 'wood', min);
    expect(plan.base).toBe(1);
    expect(plan.value).toBe(1);
  });

  it('деревянный кубик даёт только 1 или 2', () => {
    expect(planRoll(makePlayer(10), 'wood', min).value).toBe(1);
    expect(planRoll(makePlayer(10), 'wood', max).value).toBe(2);
  });

  it('тактика ждёт выбора, но заряд ещё не списан', () => {
    const plan = planRoll(withEffects(makePlayer(10), 'tactics'), 'bronze', max);
    expect(plan.needsTactics).toBe(true);
    expect(plan.state.effects).toEqual([{ code: 'tactics', charges: 1 }]);
  });
});

describe('выбор тактики', () => {
  it('плюс один списывает заряд и поднимает значение', () => {
    const result = applyTacticsChoice(withEffects(makePlayer(10), 'tactics'), 3, 1);
    expect(result.value).toBe(4);
    expect(result.delta).toBe(1);
    expect(result.state.effects).toEqual([]);
  });

  it('минус один опускает значение', () => {
    expect(applyTacticsChoice(withEffects(makePlayer(10), 'tactics'), 3, -1).value).toBe(2);
  });

  it('«как есть» тоже расходует заряд', () => {
    const result = applyTacticsChoice(withEffects(makePlayer(10), 'tactics'), 3, 0);
    expect(result.value).toBe(3);
    expect(result.state.effects).toEqual([]);
  });

  it('сдвиг ограничен одним шагом', () => {
    expect(applyTacticsChoice(withEffects(makePlayer(10), 'tactics'), 3, 5).value).toBe(4);
    expect(applyTacticsChoice(withEffects(makePlayer(10), 'tactics'), 3, -5).value).toBe(2);
  });

  it('единица не превращается в ноль', () => {
    expect(applyTacticsChoice(withEffects(makePlayer(10), 'tactics'), 1, -1).value).toBe(1);
  });
});

describe('эффекты к записи', () => {
  it('пустые заряды отбрасываются', () => {
    const state: PlayerState = {
      ...makePlayer(10),
      effects: [
        { code: 'shieldki', charges: 0 },
        { code: 'yellow_card', charges: 2 },
      ],
    };
    expect(keptEffects(state)).toEqual([{ code: 'yellow_card', charges: 2 }]);
  });
});
