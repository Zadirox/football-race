'use client';

import { usePathname } from 'next/navigation';
import { MapScene } from '@/components/map/MapScene';

/**
 * Фон внутренних экранов. На главной карта своя, интерактивная,
 * поэтому здесь фон прячется, а не размонтируется — сцена остаётся
 * в дереве и не пересоздаётся при переходах между экранами.
 */
export function MapBackdrop() {
  const pathname = usePathname();
  const hidden = pathname === '/';

  return (
    <div className="map-backdrop" aria-hidden={hidden ? 'true' : 'true'} hidden={hidden}>
      <div className="map-backdrop__canvas">
        <MapScene />
      </div>
    </div>
  );
}
