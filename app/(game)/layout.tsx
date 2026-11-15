import { Suspense } from 'react';
import { Header } from '@/components/shell/Header';
import { Snowfall } from '@/components/map/Snowfall';
import { Onboarding } from '@/components/game/Onboarding';
import { DayResultsSummary } from '@/components/game/DayResultsSummary';
import { GameHud } from '@/components/map/GameHud';
import { hasDatabase, serverEnv } from '@/lib/env';
import { listUnopenedPacks } from '@/lib/repo/cards';
import { loadSeasonSnapshot } from '@/lib/repo/season';

export const dynamic = 'force-dynamic';

/**
 * Оболочка игры: интерактивная карта всегда смонтирована (чтобы не дёргалась
 * при открытии/закрытии вкладок), шапка поверх неё, а контент экранов —
 * панель-оверлей поверх карты.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await loadSeasonSnapshot();
  const { cardsEnabled } = serverEnv();

  let unopenedPacks = 0;
  if (cardsEnabled && !snapshot.demo && snapshot.me && snapshot.season?.id && hasDatabase()) {
    try {
      const packs = await listUnopenedPacks(snapshot.me.profileId, snapshot.season.id);
      unopenedPacks = packs.length;
    } catch {
      unopenedPacks = 0;
    }
  }

  return (
    <div className="app-shell">
      <Suspense fallback={null}>
        <GameHud snapshot={snapshot} />
      </Suspense>
      <Snowfall />
      <Header
        me={snapshot.me}
        closesAt={snapshot.matchday?.closesAt ?? null}
        demo={snapshot.demo}
        cardsEnabled={cardsEnabled}
        unopenedPacks={unopenedPacks}
      />
      {children}
      <Suspense fallback={null}>
        <DayResultsSummary snapshot={snapshot} />
      </Suspense>
      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>
    </div>
  );
}
