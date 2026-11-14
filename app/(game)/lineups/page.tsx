import Link from 'next/link';
import { Panel, Notice } from '@/components/ui/Panel';
import { getViewer } from '@/lib/auth/session';
import { hasDatabase, serverEnv } from '@/lib/env';
import { listCollection } from '@/lib/repo/cards';
import { getMyLineup, listLineupMatches } from '@/lib/repo/lineups';
import { loadSeasonSnapshot } from '@/lib/repo/season';
import type { MatchLineupView } from '@/lib/types';
import { LineupsClient } from './LineupsClient';

export default async function LineupsPage() {
  const { cardsEnabled } = serverEnv();
  if (!cardsEnabled) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных на матчи дня." size="wide">
        <Notice>Раздел карточек и составов временно скрыт. Скоро вернётся.</Notice>
      </Panel>
    );
  }

  const snapshot = await loadSeasonSnapshot();
  const viewer = await getViewer();
  const seasonId = snapshot.season?.id ?? null;
  const profileId = viewer?.profileId ?? snapshot.me?.profileId ?? null;

  if (!hasDatabase() || snapshot.demo) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных на матчи дня." size="wide">
        <Notice>Демо-режим: база не подключена, составы недоступны.</Notice>
      </Panel>
    );
  }

  if (!profileId || !seasonId) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных на матчи дня." size="wide">
        <Notice tone="info">Войдите в аккаунт, чтобы выставлять составы.</Notice>
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

  return (
    <Panel
      title="Составы"
      subtitle="До 3 карточек на матч своей сборной: 1 вратарь + 2 полевых. Состав можно менять до кик-оффа."
      size="wide"
    >
      <LineupsClient matches={matchesWithSlots} ownedCards={ownedCards} />
    </Panel>
  );
}