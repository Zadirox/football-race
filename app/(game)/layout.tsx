import { Header } from '@/components/shell/Header';
import { MapBackdrop } from '@/components/shell/MapBackdrop';
import { Snowfall } from '@/components/map/Snowfall';
import { loadSeasonSnapshot } from '@/lib/repo/season';

/**
 * Оболочка игры: карта как фон, шапка с табами и таймером,
 * контент экрана — панель поверх карты (docs/05 §1).
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await loadSeasonSnapshot();

  return (
    <div className="app-shell">
      <MapBackdrop />
      <Snowfall />
      <Header me={snapshot.me} closesAt={snapshot.matchday?.closesAt ?? null} demo={snapshot.demo} />
      {children}
    </div>
  );
}
