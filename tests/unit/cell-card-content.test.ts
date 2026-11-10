import { describe, expect, it } from 'vitest';
import { cellCardContent } from '@/lib/ui/cell-card-content';

const flavor = { title: 'Тики-така', line: 'Три паса назад — и вперёд' };

describe('cellCardContent', () => {
  it('обычная клетка явно называет себя обычной', () => {
    const content = cellCardContent({ idx: 27, kind: 'plain', mechanicCode: null }, flavor);
    expect(content.badge).toBe('Обычная клетка');
    expect(content.tone).toBe('plain');
    expect(content.title).toBe('Тики-така');
    expect(content.line).toBe('Три паса назад — и вперёд');
    expect(content.note).toBeNull();
    expect(content.mechanicCode).toBeNull();
  });

  it('без флейвора остаётся честной заглушкой', () => {
    const content = cellCardContent({ idx: 27, kind: 'plain', mechanicCode: null }, null);
    expect(content.badge).toBe('Обычная клетка');
    expect(content.title).toBe('Обычная клетка');
    expect(content.line).toBe('Просто шаг вперёд.');
  });

  it('событийная клетка показывает механику и полярность', () => {
    const content = cellCardContent({ idx: 5, kind: 'event', mechanicCode: '01' }, null);
    expect(content.badge).toBe('Позитив');
    expect(content.tone).toBe('positive');
    expect(content.title).toBe('Контратака');
    expect(content.line).toBe('+3 клетки вперёд');
    expect(content.note).toBe('Сработает, когда встанешь на клетку');
    expect(content.mechanicCode).toBe('01');
  });

  it('ловушка красится отдельно', () => {
    const content = cellCardContent({ idx: 9, kind: 'event', mechanicCode: '09' }, null);
    expect(content.badge).toBe('Ловушка');
    expect(content.tone).toBe('trap');
  });

  it('событие без известной механики не роняет карточку', () => {
    const content = cellCardContent({ idx: 9, kind: 'event', mechanicCode: '99' }, null);
    expect(content.badge).toBe('Событие');
    expect(content.tone).toBe('neutral');
    expect(content.line).toBe('Событие без описания');
  });

  it('старт и финиш имеют свои тексты', () => {
    const start = cellCardContent({ idx: 1, kind: 'start', mechanicCode: null }, null);
    expect(start.badge).toBe('Старт');
    expect(start.tone).toBe('start');
    expect(start.title).toBe('Старт');

    const finish = cellCardContent({ idx: 80, kind: 'finish', mechanicCode: null }, null);
    expect(finish.badge).toBe('Финиш');
    expect(finish.tone).toBe('finish');
    expect(finish.line).toContain('Кубок');
  });
});
