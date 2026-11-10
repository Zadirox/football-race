import { GameHud } from '@/components/map/GameHud';
import { loadSeasonSnapshot } from '@/lib/repo/season';

export default async function MapPage() {
  const snapshot = await loadSeasonSnapshot();
  return <GameHud snapshot={snapshot} />;
}
