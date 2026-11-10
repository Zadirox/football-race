import { describe, expect, it } from 'vitest';
import type { ActiveEffect } from '@/lib/game/engine';
import {
  EXPIRABLE_KINDS,
  expiryDecision,
  expiryLog,
  isExpirableKind,
} from '@/lib/game/pending-expiry';

function effect(code: ActiveEffect['code'], charges = 1): ActiveEffect {
  return { code, charges };
}

describe('безопасные ветки брошенных ожиданий', () => {
  it('VAR закрывается принятием решения, а не риском', () => {
    expect(expiryDecision('var')).toEqual({ kind: 'var', contest: false });
  });

  it('тактика оставляет бросок как есть', () => {
    expect(expiryDecision('tactics')).toEqual({ kind: 'tactics', delta: 0 });
  });

  it('раздевалка снимает первый негатив по порядку эффектов', () => {
    expect(expiryDecision('locker', [effect('tribuny'), effect('gazon'), effect('yellow_card')])).toEqual({
      kind: 'locker',
      remove: 'gazon',
    });
  });

  it('раздевалка без негативов шагает вперёд', () => {
    expect(expiryDecision('locker', [effect('shieldki'), effect('tribuny')])).toEqual({
      kind: 'locker',
      remove: 'advance',
    });
    expect(expiryDecision('locker')).toEqual({ kind: 'locker', remove: 'advance' });
  });

  it('передача закрывается отказом от паса', () => {
    expect(expiryDecision('passage')).toEqual({ kind: 'passage', targetId: null });
  });

  it('неизвестное ожидание остаётся админу', () => {
    expect(expiryDecision('something_else')).toBeNull();
    expect(expiryDecision('')).toBeNull();
  });

  it('список D7 распознаётся по типу', () => {
    for (const kind of EXPIRABLE_KINDS) expect(isExpirableKind(kind)).toBe(true);
    expect(isExpirableKind('roll')).toBe(false);
  });

  it('в ленту попадает пропуск выбора и решение судьи', () => {
    expect(expiryLog('Марк', { kind: 'var', contest: false })).toBe(
      'Марк не ответил — судья решил за него: принимаем решение, минус одна клетка.',
    );
    expect(expiryLog('Марк', { kind: 'locker', remove: 'advance' })).toContain('шаг вперёд');
    expect(expiryLog('Марк', { kind: 'locker', remove: 'gazon' })).toContain('негатив снят');
    expect(expiryLog('Марк', { kind: 'passage', targetId: null })).toContain('остаётся на месте');
  });
});
