import { CLUB_COMPETITION_BY_LEAGUE_CODE, matchWhitelistClub, normalizeClubTeamName } from '@/lib/data/club-phase';
import { teamDisplay } from '@/lib/data/team-names';
import type { CardSetKind, OwnedCardView } from '@/lib/types';

export type LineupMatchRef = {
  homeName: string;
  awayName: string;
  leagueCode?: string | null;
};

export type LineupCardRef = Pick<
  OwnedCardView,
  'setKind' | 'nationalTeam' | 'nationalTeamSlug' | 'clubId' | 'clubName'
> & {
  nationality?: string | null;
};

function normalizeNational(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function canonicalNationalTeamName(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const display = teamDisplay(raw).name;
  return normalizeNational(display) || normalizeNational(raw);
}

function nationalTeamCandidates(values: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    const rawNorm = normalizeNational(value);
    const canon = canonicalNationalTeamName(value);
    if (rawNorm) out.add(rawNorm);
    if (canon) out.add(canon);
  }
  out.delete('');
  return out;
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

export function isClubContestMatch(match: Pick<LineupMatchRef, 'leagueCode'>): boolean {
  const code = (match.leagueCode ?? '').toUpperCase();
  if (!code) return false;
  if (code === 'UNL') return false;
  return Boolean(CLUB_COMPETITION_BY_LEAGUE_CODE[code]);
}

function resolveMatchClubSide(match: LineupMatchRef, side: 'home' | 'away') {
  const name = side === 'home' ? match.homeName : match.awayName;
  return matchWhitelistClub(name);
}

function resolveCardClub(card: Pick<LineupCardRef, 'clubName' | 'clubId'>) {
  // Primary: match by club name via whitelist aliases/config. clubId is DB UUID (not used for alias mapping).
  if (card.clubName) {
    const byName = matchWhitelistClub(card.clubName);
    if (byName) return byName;
  }
  return null;
}

function sameClub(a: { slug: string } | null, b: { slug: string } | null): boolean {
  return Boolean(a && b && a.slug === b.slug);
}

export function lineupCardSetKind(card: Pick<LineupCardRef, 'setKind' | 'clubId' | 'clubName'>): CardSetKind {
  if (card.setKind === 'club') return 'club';
  if (card.setKind === 'national') return 'national';
  // Fallback heuristic
  return card.clubId || card.clubName ? 'club' : 'national';
}

export type MatchSide = 'home' | 'away';

/**
 * Returns side for eligible card-match pair, or null if not eligible.
 * D4.1=A: club cards match by club entity/whitelist aliases to match side in club contests.
 * National behavior preserved for national/UNL matches.
 */
export function getLineupCardMatchSide(card: LineupCardRef, match: LineupMatchRef): MatchSide | null {
  const clubContest = isClubContestMatch(match);
  const cardKind = lineupCardSetKind(card);

  if (clubContest) {
    // MVP D4.1=A: club cards eligible for club matches by club matching.
    if (cardKind !== 'club') return null;
    const cardClub = resolveCardClub(card);
    if (!cardClub) return null;
    const homeClub = resolveMatchClubSide(match, 'home');
    const awayClub = resolveMatchClubSide(match, 'away');
    const homeMatch = sameClub(cardClub, homeClub);
    const awayMatch = sameClub(cardClub, awayClub);
    if (homeMatch && !awayMatch) return 'home';
    if (awayMatch && !homeMatch) return 'away';
    return null; // no match or ambiguous
  }

  // National/other: preserve existing national team matching behavior.
  if (cardKind === 'club') return null;
  const home = nationalTeamCandidates([match.homeName]);
  const away = nationalTeamCandidates([match.awayName]);
  const cardTeams = nationalTeamCandidates([
    card.nationalTeam,
    card.nationality ?? null,
    card.nationalTeamSlug ?? null,
  ]);
  const homeMatch = setsIntersect(cardTeams, home);
  const awayMatch = setsIntersect(cardTeams, away);
  if (homeMatch && !awayMatch) return 'home';
  if (awayMatch && !homeMatch) return 'away';
  return null;
}

export function canLineupCardPlayMatch(card: LineupCardRef, match: LineupMatchRef): boolean {
  return getLineupCardMatchSide(card, match) !== null;
}

export function lineupCardTeamLabel(card: Pick<OwnedCardView, 'setKind' | 'nationalTeam' | 'clubName'>): string {
  if (lineupCardSetKind(card) === 'club') return card.clubName || card.nationalTeam || '';
  return card.nationalTeam || card.clubName || '';
}
