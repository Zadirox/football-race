import { describe, expect, it } from 'vitest';
import { isClubMatchAllowedForCompetition, matchWhitelistClub } from '@/lib/data/club-phase';

describe('club whitelist matching', () => {
  it('does not match Inter Club d Escaldes to Inter Milan whitelist alias', () => {
    expect(matchWhitelistClub("Inter Club d'Escaldes")).toBeNull();
    expect(matchWhitelistClub('Интер Эскальдес')).toBeNull();
  });

  it('still matches legitimate Inter Milan names', () => {
    expect(matchWhitelistClub('Inter')?.slug).toBe('inter');
    expect(matchWhitelistClub('Inter Milan')?.slug).toBe('inter');
    expect(matchWhitelistClub('Internazionale')?.slug).toBe('inter');
  });

  it('keeps ECL whitelist_only scope for real whitelisted clubs but rejects false Inter match', () => {
    expect(isClubMatchAllowedForCompetition("Inter Club d'Escaldes", 'FC Copenhagen', 'ECL')).toBe(false);
  });
});
