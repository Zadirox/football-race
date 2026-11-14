import Link from 'next/link';
import { Panel, Notice } from '@/components/ui/Panel';
import { getViewer } from '@/lib/auth/session';
import { hasDatabase, serverEnv } from '@/lib/env';
import { listCollection, listUnopenedPacks } from '@/lib/repo/cards';
import { loadSeasonSnapshot } from '@/lib/repo/season';
import { CollectionClient } from './CollectionClient';

export default async function CollectionPage() {
  const { cardsEnabled } = serverEnv();
  if (!cardsEnabled) {
    return (
      <Panel title="Коллекция" subtitle="Карточки игроков сборных и паки." size="wide">
        <Notice>Раздел карточек и паков временно скрыт. Скоро вернётся.</Notice>
      </Panel>
    );
  }

  const snapshot = await loadSeasonSnapshot();
  const viewer = await getViewer();
  const seasonId = snapshot.season?.id ?? null;
  const profileId = viewer?.profileId ?? snapshot.me?.profileId ?? null;

  if (!hasDatabase() || snapshot.demo) {
    return (
      <Panel title="Коллекция" subtitle="Карточки игроков сборных и паки." size="wide">
        <Notice>Демо-режим: база не подключена, коллекция и паки недоступны.</Notice>
      </Panel>
    );
  }

  if (!profileId || !seasonId) {
    return (
      <Panel title="Коллекция" subtitle="Карточки игроков сборных и паки." size="wide">
        <Notice tone="info">Войдите в аккаунт, чтобы видеть свои паки и коллекцию.</Notice>
        <div style={{ marginTop: 12 }}>
          <Link href="/login" className="btn btn--primary">Войти</Link>
        </div>
      </Panel>
    );
  }

  const [packs, cards] = await Promise.all([
    listUnopenedPacks(profileId, seasonId),
    listCollection(profileId, seasonId),
  ]);

  return (
    <Panel
      title="Коллекция"
      subtitle="Национальные карточки: открывайте паки и собирайте состав сборных."
      size="wide"
    >
      <CollectionClient packs={packs} cards={cards} />
    </Panel>
  );
}