import { describe, expect, it } from 'vitest';
import {
  classifyMatchContour,
  extractSstatsLeagueId,
  type MatchContourRow,
} from '@/lib/repo/cards-grants';

// Helper to satisfy type shape used by classifyMatchContour
const m = (partial: Partial<MatchContourRow>): MatchContourRow => ({
  provider: 'sstats',
  league_code: null,
  league_title: null,
  raw: null,
  ...partial,
});

describe('extractSstatsLeagueId', () => {
  it('returns null for non-objects', () => {
    expect(extractSstatsLeagueId(null)).toBeNull();
    expect(extractSstatsLeagueId(undefined)).toBeNull();
    expect(extractSstatsLeagueId('2')).toBeNull();
  });

  it('extracts from common direct keys', () => {
    expect(extractSstatsLeagueId({ leagueId: 39 })).toBe(39);
    expect(extractSstatsLeagueId({ LeagueId: 2 })).toBe(2);
    expect(extractSstatsLeagueId({ league_id: 3 })).toBe(3);
    expect(extractSstatsLeagueId({ LeagueID: '848' })).toBe(848);
  });

  it('extracts from nested league object', () => {
    expect(extractSstatsLeagueId({ league: { id: 135 } })).toBe(135);
    expect(extractSstatsLeagueId({ league: { leagueId: 140 } })).toBe(140);
  });

  it('detects known club league id values in shallow scan', () => {
    expect(extractSstatsLeagueId({ someField: 2 })).toBe(2); // UCL
    expect(extractSstatsLeagueId({ foo: '39' })).toBe(39); // PL
  });

  it('extracts non-club ids when explicitly present, and returns null when absent', () => {
    expect(extractSstatsLeagueId({ leagueId: 5 })).toBe(5); // UNL id (not a club comp)
    expect(extractSstatsLeagueId({ foo: 'bar' })).toBeNull();
  });
});

describe('classifyMatchContour', () => {
  it('classifies UNL league_code as national', () => {
    expect(classifyMatchContour(m({ league_code: 'UNL' }))).toBe('national');
    expect(classifyMatchContour(m({ league_code: 'unl' }))).toBe('national');
  });

  it('classifies known in-scope club league codes as club (Stage 3 Y4)', () => {
    expect(classifyMatchContour(m({ league_code: 'CL' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'PL' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'PD' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'BL1' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'SA' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'FL1' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'SLTR' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'EL' }))).toBe('club');
    expect(classifyMatchContour(m({ league_code: 'ECL' }))).toBe('club');
  });

  it('treats removed/out-of-scope domestic leagues as unknown (Y4)', () => {
    expect(classifyMatchContour(m({ league_code: 'DED' }))).toBe('unknown');
    expect(classifyMatchContour(m({ league_code: 'PPL' }))).toBe('unknown');
  });

  it('classifies by sstats club league id in raw as club', () => {
    expect(classifyMatchContour(m({ league_code: null, raw: { leagueId: 2 } }))).toBe('club'); // UCL
    expect(classifyMatchContour(m({ league_code: null, raw: { league: { id: 39 } } }))).toBe('club'); // PL
    expect(classifyMatchContour(m({ league_code: 'SOMETHING', raw: { LeagueId: 848 } }))).toBe('club'); // UECL
  });

  it('treats removed competition sstats league ids as unknown (Y4)', () => {
    expect(classifyMatchContour(m({ league_code: null, raw: { leagueId: 88 } }))).toBe('unknown'); // Eredivisie removed
    expect(classifyMatchContour(m({ league_code: null, raw: { leagueId: 333 } }))).toBe('unknown'); // UPL removed
  });

  it('prefers national signal for UNL code even if raw ambiguous', () => {
    // league_code UNL is checked first
    expect(classifyMatchContour(m({ league_code: 'UNL', raw: { leagueId: 2 } }))).toBe('national');
  });

  it('returns unknown for unmapped matches (fail-safe)', () => {
    expect(classifyMatchContour(m({ league_code: 'XYZ', raw: {} }))).toBe('unknown');
    expect(classifyMatchContour(m({ league_code: null, raw: null }))).toBe('unknown');
    expect(classifyMatchContour(m({ league_code: 'TSL', raw: { leagueId: 9999 } }))).toBe('unknown');
  });
});
