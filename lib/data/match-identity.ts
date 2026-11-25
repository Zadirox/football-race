import { canonicalTeamKey as canonicalTeamKeyFromNames, isKnownTeamName } from './team-names';

export { isKnownTeamName };

export type CanonicalMatchKeyResult = {
  key: string | null;
  homeKey: string | null;
  awayKey: string | null;
  suspicious: boolean;
  reason: string | null;
};

export function canonicalTeamKey(name: string | null | undefined): string | null {
  return canonicalTeamKeyFromNames(name);
}

export function canonicalMatchKey(input: { homeName: string | null | undefined; awayName: string | null | undefined }): CanonicalMatchKeyResult {
  const homeKey = canonicalTeamKeyFromNames(input.homeName);
  const awayKey = canonicalTeamKeyFromNames(input.awayName);

  if (!homeKey || !awayKey) {
    const unknownSide = !homeKey ? 'home' : 'away';
    const unknownName = (!homeKey ? input.homeName : input.awayName) ?? '';
    return {
      key: null,
      homeKey,
      awayKey,
      suspicious: true,
      reason: `unknown_team:${unknownSide}:${String(unknownName).trim()}`,
    };
  }

  return {
    key: `${homeKey}::${awayKey}`,
    homeKey,
    awayKey,
    suspicious: false,
    reason: null,
  };
}

export function isSuspiciousMatch(input: { homeName: string | null | undefined; awayName: string | null | undefined }): boolean {
  return canonicalMatchKey(input).suspicious;
}
