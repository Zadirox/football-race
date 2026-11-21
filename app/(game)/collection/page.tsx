import Link from 'next/link';
import { Panel, Notice } from '@/components/ui/Panel';
import { getViewer } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { hasDatabase, serverEnv } from '@/lib/env';
import {
  CLUB_CARD_SET_ID,
  NATIONAL_CARD_SET_ID,
  getCollectionProgresses,
  listCollection,
  listUnopenedPacks,
} from '@/lib/repo/cards';
import { CollectionClient } from './CollectionClient';

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

export default async function CollectionPage() {
  const { cardsEnabled } = serverEnv();
  if (!cardsEnabled) {
    return (
      <Panel title="Коллекция" subtitle="Карточки игроков сборных и паки." size="wide">
        <Notice>Раздел карточек и паков временно скрыт. Скоро вернётся.</Notice>
      </Panel>
    );
  }

  if (!hasDatabase()) {
    return (
      <Panel title="Коллекция" subtitle="Карточки игроков сборных и паки." size="wide">
        <Notice>Демо-режим: база не подключена, коллекция и паки недоступны.</Notice>
      </Panel>
    );
  }

  const viewer = await getViewer();
  const profileId = viewer?.profileId ?? null;
  const seasonId = await getActiveSeasonId();

  if (!profileId || !seasonId) {
    return (
      <Panel title="Коллекция" subtitle="Карточки игроков сборных и паки." size="wide">
        <Notice tone="info">Войдите в аккаунт и убедитесь, что сезон активен, чтобы видеть свои паки и коллекцию.</Notice>
        <div style={{ marginTop: 12 }}>
          <Link href="/login" className="btn btn--primary">Войти</Link>
        </div>
      </Panel>
    );
  }

  const [packs, cards, progresses] = await Promise.all([
    listUnopenedPacks(profileId, seasonId),
    listCollection(profileId, seasonId),
    getCollectionProgresses(profileId, seasonId, [NATIONAL_CARD_SET_ID, CLUB_CARD_SET_ID]),
  ]);

  return (
    <Panel
      title="Коллекция"
      subtitle="Открывайте паки и собирайте карточки сборных и клубов."
      size="wide"
    >
      <CollectionClient packs={packs} cards={cards} progresses={progresses} />
    </Panel>
  );
}