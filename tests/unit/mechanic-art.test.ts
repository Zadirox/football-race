import { describe, expect, it } from 'vitest';
import { artSrcFor } from '@/lib/ui/mechanic-art';

describe('artSrcFor', () => {
  it('строит путь для валидных кодов механик', () => {
    expect(artSrcFor('01')).toBe('/art/mechanics/01.png');
    expect(artSrcFor('18')).toBe('/art/mechanics/18.png');
    expect(artSrcFor('19')).toBe('/art/mechanics/19.png');
    expect(artSrcFor('20')).toBe('/art/mechanics/20.png');
  });

  it('возвращает null для пустого и неизвестного кода', () => {
    expect(artSrcFor(null)).toBeNull();
    expect(artSrcFor(undefined)).toBeNull();
    expect(artSrcFor('1')).toBeNull();
    expect(artSrcFor('00')).toBeNull();
    expect(artSrcFor('21')).toBeNull();
    expect(artSrcFor('xx')).toBeNull();
  });
});
