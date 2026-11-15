import Link from 'next/link';
import { Panel, Notice } from '@/components/ui/Panel';
import { getViewer } from '@/lib/auth/session';
import { teamDisplay } from '@/lib/data/team-names';
import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { listCollection } from '@/lib/repo/cards';
import { getMyLineup, listLineupMatches } from '@/lib/repo/lineups';
import type { MatchLineupView } from '@/lib/types';
import { LineupsClient } from './LineupsClient';

async function getActiveSeasonId(): Promise<string | null> {
  const rows = await db()<{ id: string }[]>`
    select id
      from seasons
     where status = 'active'
     order by starts_on desc
     limit 1
  `;
  return rows[0]?.id ?? null;
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function canCardPlayMatch(cardTeam: string, homeName: string, awayName: string): boolean {
  const cardCanon = normalize(teamDisplay(cardTeam).name) || normalize(cardTeam);
  const homeCanon = normalize(teamDisplay(homeName).name) || normalize(homeName);
  const awayCanon = normalize(teamDisplay(awayName).name) || normalize(awayName);
  if (!cardCanon) return false;
  return cardCanon === homeCanon || cardCanon === awayCanon;
}

export default async function LineupsPage() {
  const { cardsEnabled } = serverEnv();
  if (!cardsEnabled) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных на матчи дня." size="wide">
        <Notice>Раздел карточек и составов временно скрыт. Скоро вернётся.</Notice>
      </Panel>
    );
  }

  if (!hasDatabase()) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных на матчи дня." size="wide">
        <Notice>Демо-режим: база не подключена, составы недоступны.</Notice>
      </Panel>
    );
  }

  const viewer = await getViewer();
  const profileId = viewer?.profileId ?? null;
  const seasonId = await getActiveSeasonId();

  if (!profileId || !seasonId) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных на матчи дня." size="wide">
        <Notice tone="info">Войдите в аккаунт и убедитесь, что сезон активен, чтобы выставлять составы.</Notice>
        <div style={{ marginTop: 12 }}>
          <Link href="/login" className="btn btn--primary">Войти</Link>
        </div>
      </Panel>
    );
  }

  const [matches, ownedCards] = await Promise.all([
    listLineupMatches(seasonId),
    listCollection(profileId, seasonId),
  ]);

  const matchesWithSlots: MatchLineupView[] = await Promise.all(
    matches.map(async (match) => {
      const slots = await getMyLineup(match.matchId, profileId, seasonId);
      return { ...match, slots };
    }),
  );

  const eligibleMatches = matchesWithSlots.filter((match) =>
    ownedCards.some((card) => canCardPlayMatch(card.nationalTeam, match.homeName, match.awayName)),
  );

  return (
    <Panel
      title="Составы"
      subtitle="До 3 карточек на матч своей сборной: 1 вратарь + 2 полевых. Состав можно менять до кик-оффа."
      size="wide"
    >
      {eligibleMatches.length === 0 ? (
        <Notice tone="info">
          Нет матчей, где у вас есть хотя бы одна карточка игрока из участвующей сборной. Получите карточки команд
          сегодняшних матчей, чтобы выставить состав.
        </Notice>
      ) : (
        <LineupsClient matches={eligibleMatches} ownedCards={ownedCards} />
      )}
    </Panel>
  );
}