import { RatingsClient } from './RatingsClient';
import { buildRatings } from '@/lib/game/scoring';
import { loadSeasonSnapshot } from '@/lib/repo/season';

export default async function RatingsPage() {
  const snapshot = await loadSeasonSnapshot();
  const rows = buildRatings(snapshot.ratingsSeed);
  return <RatingsClient rows={rows} meId={snapshot.me?.profileId ?? null} />;
}
