export default function GameLoading() {
  // Route-level loading suppressed: showing a full panel here causes a
  // "reopen flash" when closing a tab (navigate to / shows loading panel
  // briefly before resolving to the empty map). Layout-level data loading
  // is handled separately.
  return null;
}
