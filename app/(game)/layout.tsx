import { Suspense } from 'react';
import { Header } from '@/components/shell/Header';
import { Snowfall } from '@/components/map/Snowfall';
import { Onboarding } from '@/components/game/Onboarding';
import { DayResultsSummary } from '@/components/game/DayResultsSummary';
import { GameHud } from '@/components/map/GameHud';
import { loadSeasonSnapshot } from '@/lib/repo/season';

export const dynamic = 'force-dynamic';

/**
 * Оболочка игры: интерактивная карта всегда смонтирована (чтобы не дёргалась
 * при открытии/закрытии вкладок), шапка поверх неё, а контент экранов —
 * панель-оверлей поверх карты.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await loadSeasonSnapshot();

  return (
    <div className="app-shell">
      <Suspense fallback={null}>
        <GameHud snapshot={snapshot} />
      </Suspense>
      <Snowfall />
      <Header me={snapshot.me} closesAt={snapshot.matchday?.closesAt ?? null} demo={snapshot.demo} />
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
