import { PredictionsClient } from './PredictionsClient';
import { loadSeasonSnapshot } from '@/lib/repo/season';

export default async function PredictionsPage() {
  const snapshot = await loadSeasonSnapshot();
  return <PredictionsClient snapshot={snapshot} />;
}
