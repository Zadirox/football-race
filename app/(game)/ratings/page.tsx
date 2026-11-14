import { RatingsClient } from './RatingsClient';
import { buildRatings } from '@/lib/game/scoring';
import { loadSeasonSnapshot } from '@/lib/repo/season';
import {
  demoClosedMatchdays,
  demoMatchdayResults,
  loadClosedMatchdays,
  loadMatchdayResults,
} from '@/lib/repo/matchday-results';

export default async function RatingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ day?: string }>;
}) {
  const snapshot = await loadSeasonSnapshot();
  const rows = buildRatings(snapshot.ratingsSeed);
  const params = (await searchParams) ?? {};
  const closedDays = snapshot.demo
    ? demoClosedMatchdays(snapshot)
    : await loadClosedMatchdays(snapshot.season.id);

  const selectedDayId =
    (params.day && closedDays.some((d) => d.id === params.day) ? params.day : null) ?? closedDays[0]?.id ?? null;

  const dayResults = selectedDayId
    ? snapshot.demo
      ? demoMatchdayResults(snapshot, selectedDayId)
      : await loadMatchdayResults(snapshot.season.id, selectedDayId)
    : [];

  return (
    <RatingsClient
      rows={rows}
      meId={snapshot.me?.profileId ?? null}
      closedDays={closedDays}
      selectedDayId={selectedDayId}
      dayResults={dayResults}
    />
  );
}
