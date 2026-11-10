import { MatchesClient } from './MatchesClient';
import { loadSeasonSnapshot } from '@/lib/repo/season';

export default async function MatchesPage() {
  const snapshot = await loadSeasonSnapshot();
  return <MatchesClient matches={snapshot.matches} />;
}
