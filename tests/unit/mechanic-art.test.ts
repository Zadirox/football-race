import { describe, expect, it } from 'vitest';
import { artSrcFor } from '@/lib/ui/mechanic-art';

describe('artSrcFor', () => {
  it('строит путь для механик 01–18', () => {
    expect(artSrcFor('01')).toBe('/art/mechanics/01.png');
    expect(artSrcFor('18')).toBe('/art/mechanics/18.png');
  });

  it('возвращает null для пустого и неизвестного кода', () => {
    expect(artSrcFor(null)).toBeNull();
    expect(artSrcFor(undefined)).toBeNull();
    expect(artSrcFor('1')).toBeNull();
    expect(artSrcFor('19')).toBeNull();
    expect(artSrcFor('xx')).toBeNull();
  });
});
