import { Suspense } from 'react';
import { Header } from '@/components/shell/Header';
import { MapBackdrop } from '@/components/shell/MapBackdrop';
import { Snowfall } from '@/components/map/Snowfall';
import { Onboarding } from '@/components/game/Onboarding';
import { PanelLoading } from '@/components/shell/PanelLoading';
import { loadSeasonSnapshot } from '@/lib/repo/season';

/**
 * Оболочка игры: карта как фон, шапка с табами и таймером,
 * контент экрана — панель поверх карты (docs/05 §1).
 *
 * Оболочка статична, а снимок сезона грузится в `Suspense`: при переходе
 * между экранами шапка и карта остаются на месте и не мигают, поэтому
 * игра ощущается приложением, а не набором страниц.
 */
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <MapBackdrop />
      <Snowfall />
      <Suspense fallback={<Header me={null} closesAt={null} demo={false} />}>
        <HeaderSlot />
      </Suspense>
      <Suspense fallback={<PanelLoading />}>{children}</Suspense>
      <Suspense fallback={null}>
        <Onboarding />
      </Suspense>
    </div>
  );
}

async function HeaderSlot() {
  const snapshot = await loadSeasonSnapshot();
  return <Header me={snapshot.me} closesAt={snapshot.matchday?.closesAt ?? null} demo={snapshot.demo} />;
}
