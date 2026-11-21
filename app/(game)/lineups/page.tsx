import Link from 'next/link';
import { Panel, Notice } from '@/components/ui/Panel';
import { getViewer } from '@/lib/auth/session';
import { teamDisplay } from '@/lib/data/team-names';
import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import { canLineupCardPlayMatch } from '@/lib/game/lineup-eligibility';
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

export default async function LineupsPage() {
  const { cardsEnabled } = serverEnv();
  if (!cardsEnabled) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных и клубов на матчи." size="wide">
        <Notice>Система карточек сейчас отключена. Скоро вернётся.</Notice>
      </Panel>
    );
  }

  if (!hasDatabase()) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных и клубов на матчи." size="wide">
        <Notice>DATA-MODE: база не подключена, составы недоступны.</Notice>
      </Panel>
    );
  }

  const viewer = await getViewer();
  const profileId = viewer?.profileId ?? null;
  const seasonId = await getActiveSeasonId();

  if (!profileId || !seasonId) {
    return (
      <Panel title="Составы" subtitle="Выставляйте карточки сборных и клубов на матчи." size="wide">
        <Notice tone="info">Войдите в аккаунт и выберите игрока, чтобы выставлять составы.</Notice>
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
    ownedCards.some((card) =>
      canLineupCardPlayMatch(card, {
        homeName: match.homeName,
        awayName: match.awayName,
        leagueCode: match.leagueCode ?? null,
      }),
    ),
  );

  return (
    <Panel
      title="Составы"
      subtitle="До 3 карточек на матч: 1 вратарь + 2 полевых. Состав можно менять до начала матча."
      size="wide"
    >
      {eligibleMatches.length === 0 ? (
        <Notice tone="info">
          Нет матчей, где у вас есть хотя бы одна подходящая карточка команды-участницы. Получайте карточки в коллекции, чтобы выставлять состав.
        </Notice>
      ) : (
        <LineupsClient matches={eligibleMatches} ownedCards={ownedCards} />
      )}
    </Panel>
  );
}
