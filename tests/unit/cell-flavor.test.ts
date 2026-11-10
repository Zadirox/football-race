import { describe, expect, it } from 'vitest';
import { PLAIN_FLAVORS, flavorFor, flavorMap } from '@/lib/game/cell-flavor';

describe('cell-flavor', () => {
  it('содержит 40 уникальных названий', () => {
    expect(PLAIN_FLAVORS).toHaveLength(40);
    expect(new Set(PLAIN_FLAVORS.map((f) => f.title)).size).toBe(40);
  });

  it('держит названия короткими, а строки непустыми', () => {
    for (const flavor of PLAIN_FLAVORS) {
      expect(flavor.title.length).toBeLessThanOrEqual(24);
      expect(flavor.line.length).toBeGreaterThan(0);
      expect(flavor.line.length).toBeLessThanOrEqual(48);
    }
  });

  it('раздаёт флейворы по возрастанию номера клетки', () => {
    const map = flavorMap([5, 2, 3]);
    expect(map.get(2)?.title).toBe('Турникет и шаурма');
    expect(map.get(3)?.title).toBe('Клубный магазин');
    expect(map.get(5)?.title).toBe('Мама, я на стадионе');
  });

  it('покрывает 38 клеток без повторов', () => {
    const plain = [
      2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 14, 19, 22, 25, 27, 29, 31, 35, 37, 38, 40, 45, 50, 51, 54, 55, 57,
      59, 60, 61, 63, 64, 67, 70, 73, 74, 77, 79,
    ];
    const map = flavorMap(plain);
    expect(map.size).toBe(38);
    expect(new Set([...map.values()].map((f) => f.title)).size).toBe(38);
    expect(map.get(79)?.title).toBe('Фейерверк');
  });

  it('не падает на пустом списке и на 41 клетке', () => {
    expect(flavorMap([]).size).toBe(0);
    const many = Array.from({ length: 41 }, (_, i) => i + 1);
    expect(flavorMap(many).size).toBe(41);
    expect(flavorFor(40).title).toBe('Турникет и шаурма');
  });

  it('нормализует отрицательный индекс', () => {
    expect(flavorFor(-1).title).toBe(PLAIN_FLAVORS[39]!.title);
  });
});
