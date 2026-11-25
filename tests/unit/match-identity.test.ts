import { describe, expect, it } from 'vitest';
import {
  canonicalTeamKey,
  canonicalMatchKey,
  isKnownTeamName,
  isSuspiciousMatch,
} from '@/lib/data/match-identity';

describe('match identity (1A/2A)', () => {
  it('recognizes known team names and aliases', () => {
    expect(isKnownTeamName('Arsenal')).toBe(true);
    expect(isKnownTeamName('Арсенал')).toBe(true);
    expect(isKnownTeamName('Man City')).toBe(true);
    expect(isKnownTeamName('Manchester City')).toBe(true);
    expect(isKnownTeamName('Случайная команда')).toBe(false);
  });

  it('returns stable canonical key for known aliases', () => {
    expect(canonicalTeamKey('Arsenal')).toBe('арсенал');
    expect(canonicalTeamKey('Arsenal FC')).toBe('арсенал');
    expect(canonicalTeamKey('Man City')).toBe('манчестер сити');
    expect(canonicalTeamKey('Manchester City')).toBe('манчестер сити');
  });

  it('returns null for unknown team when strict canonicalization is required', () => {
    expect(canonicalTeamKey('FC Unknownsville')).toBeNull();
  });

  it('builds same canonical match key for same real match across providers', () => {
    const a = canonicalMatchKey({ homeName: 'Arsenal', awayName: 'Chelsea' });
    const b = canonicalMatchKey({ homeName: 'Arsenal FC', awayName: 'Chelsea FC' });
    const c = canonicalMatchKey({ homeName: 'Арсенал', awayName: 'Челси' });
    expect(a.key).toBe(b.key);
    expect(a.key).toBe(c.key);
    expect(a.suspicious).toBe(false);
  });

  it('marks suspicious when team mapping is unknown (2A)', () => {
    const res = canonicalMatchKey({ homeName: 'Arsenal', awayName: 'Unknown FC' });
    expect(res.suspicious).toBe(true);
    expect(res.key).toBeNull();
    expect(res.reason).toContain('unknown_team');
  });

  it('different matches get different keys', () => {
    const a = canonicalMatchKey({ homeName: 'Arsenal', awayName: 'Chelsea' });
    const b = canonicalMatchKey({ homeName: 'Arsenal', awayName: 'Liverpool' });
    expect(a.key).not.toBe(b.key);
  });

  it('isSuspiciousMatch reflects unknown teams', () => {
    expect(isSuspiciousMatch({ homeName: 'Arsenal', awayName: 'Chelsea' })).toBe(false);
    expect(isSuspiciousMatch({ homeName: 'Arsenal', awayName: 'Nope FC' })).toBe(true);
  });
});
