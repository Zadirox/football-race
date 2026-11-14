import { describe, expect, it } from 'vitest';
import {
  hasCollectibleLeft,
  pickCardTemplate,
  type CardRarity,
} from '@/lib/game/cards';

type Template = { id: string; rarity: CardRarity; name: string };

const t = (id: string, rarity: CardRarity): Template => ({ id, rarity, name: id });

describe('hasCollectibleLeft', () => {
  it('returns true when total exceeds owned', () => {
    expect(hasCollectibleLeft(10, 3)).toBe(true);
  });

  it('returns false when owned equals total or exceeds', () => {
    expect(hasCollectibleLeft(3, 3)).toBe(false);
    expect(hasCollectibleLeft(3, 5)).toBe(false);
  });
});

describe('pickCardTemplate', () => {
  it('picks uniformly within rolled rarity bucket using random', () => {
    const available = [t('c1', 'common'), t('c2', 'common'), t('r1', 'rare')];
    expect(pickCardTemplate(available, 'common', () => 0)).toEqual(t('c1', 'common'));
    expect(pickCardTemplate(available, 'common', () => 0.99)).toEqual(t('c2', 'common'));
  });

  it('falls back to an available non-empty rarity when rolled bucket exhausted', () => {
    const available = [t('r1', 'rare'), t('e1', 'epic')];
    const picked = pickCardTemplate(available, 'common', () => 0);
    expect(picked).not.toBeNull();
    expect(['rare', 'epic']).toContain(picked!.rarity);
    expect(['r1', 'e1']).toContain(picked!.id);
  });

  it('fallback is deterministic for the same availability and random source', () => {
    const available = [t('r1', 'rare'), t('l1', 'legend')];
    const a = pickCardTemplate(available, 'common', () => 0.3);
    const b = pickCardTemplate(available, 'common', () => 0.3);
    expect(a).toEqual(b);
  });

  it('returns null when nothing left', () => {
    expect(pickCardTemplate([], 'rare', () => 0.5)).toBeNull();
  });

  it('never returns a template outside available set', () => {
    const available = [t('c1', 'common')];
    const picked = pickCardTemplate(available, 'legend', () => 0.7);
    expect(picked).toEqual(t('c1', 'common'));
  });
});
