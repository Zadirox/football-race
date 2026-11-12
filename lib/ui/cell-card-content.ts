/**
 * Тексты карточки клетки (docs/03 §6).
 *
 * Чистая функция: маркер на карте не должен знать, что писать в карточке.
 * У обычной клетки бейдж всегда говорит «Обычная клетка» — флейвор стоит
 * рядом и ничего не меняет в правилах.
 */

import { mechanic, POLARITY_LABEL, type MechanicPolarity } from '@/lib/game/catalog';
import type { PlainFlavor } from '@/lib/game/cell-flavor';
import type { CellView } from '@/lib/types';

export type CardTone = 'plain' | 'positive' | 'negative' | 'trap' | 'neutral' | 'start' | 'finish';

export type CardContent = {
  badge: string;
  tone: CardTone;
  title: string;
  line: string;
  note: string | null;
  mechanicCode: string | null;
};

/** Статус клетки относительно игрока: стоит на ней, прошёл или ещё идёт. */
export type CellCardPhase = 'passed' | 'current' | 'ahead';

const TONE_BY_POLARITY: Record<MechanicPolarity, CardTone> = {
  positive: 'positive',
  negative: 'negative',
  trap: 'trap',
  neutral: 'neutral',
};

function eventNote(phase: CellCardPhase): string {
  if (phase === 'current') return 'Ты стоишь на этой клетке';
  if (phase === 'passed') return 'Клетка позади — событие не сработает';
  return 'Сработает, когда встанешь на клетку';
}

export function cellCardContent(
  cell: CellView,
  flavor: PlainFlavor | null,
  phase: CellCardPhase = 'ahead',
): CardContent {
  if (cell.kind === 'start') {
    return {
      badge: 'Старт',
      tone: 'start',
      title: 'Старт',
      line: 'Отсюда все начинают сезон',
      note: phase === 'current' ? 'Ты стоишь на этой клетке' : null,
      mechanicCode: null,
    };
  }

  if (cell.kind === 'finish') {
    return {
      badge: 'Финиш',
      tone: 'finish',
      title: 'Финиш',
      line: 'Кубок. Первый дошедший забирает сезон по дистанции',
      note: phase === 'current' ? 'Ты дошёл до финиша' : null,
      mechanicCode: null,
    };
  }

  if (cell.kind === 'event') {
    const entry = mechanic(cell.mechanicCode);
    if (!entry) {
      return {
        badge: 'Событие',
        tone: 'neutral',
        title: 'Событие',
        line: 'Описание пока не добавлено',
        note: eventNote(phase),
        mechanicCode: cell.mechanicCode,
      };
    }
    return {
      badge: POLARITY_LABEL[entry.polarity],
      tone: TONE_BY_POLARITY[entry.polarity],
      title: entry.name,
      line: entry.tagline,
      note: eventNote(phase),
      mechanicCode: entry.code,
    };
  }

  if (flavor) {
    return {
      badge: 'Обычная клетка',
      tone: 'plain',
      title: flavor.title,
      line: flavor.line,
      note: phase === 'current' ? 'Ты стоишь на этой клетке' : null,
      mechanicCode: null,
    };
  }

  return {
    badge: 'Обычная клетка',
    tone: 'plain',
    title: 'Обычная клетка',
    line: 'Здесь ничего не происходит — просто шаг по пути.',
    note: phase === 'current' ? 'Ты стоишь на этой клетке' : null,
    mechanicCode: null,
  };
}
