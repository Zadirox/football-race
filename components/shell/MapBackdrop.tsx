'use client';

import { usePathname } from 'next/navigation';
import { MapScene } from '@/components/map/MapScene';

/**
 * Фон внутренних экранов. На главной карта своя, интерактивная,
 * поэтому здесь она не дублируется — иначе сцена рисуется дважды.
 */
export function MapBackdrop() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  return (
    <div className="map-backdrop" aria-hidden="true">
      <div className="map-backdrop__canvas">
        <MapScene />
      </div>
    </div>
  );
}
