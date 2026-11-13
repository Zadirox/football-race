# Stat-Based Predictions (Corners, Cards, Possession, Shots on Target) — Design

## Intent
Add new prediction question types based on match statistics for UNL matches (sstats source), so players can predict corners, cards, possession, and shots on target in addition to existing score/outcome questions.

## Goals
- Add these question types (mixed into the regular question pool, randomly selected per match):
  - Corners: total corners over 8.5? (yes/no); which team has more corners? (home/draw/away)
  - Cards: will there be a red card? (yes/no); total yellow cards over 3.5? (yes/no)
  - Possession: which team has more possession? (home/away)
  - Shots on target: which team has more shots on target? (home/draw/away); total shots on target over 8.5? (yes/no)
- Fetch and store required match statistics from sstats detailed match data (`/Games/{id}`) for sstats matches.
- Evaluate answers correctly from stored stats (app logic and DB resolve function).
- Keep question type selection random/varied per match from the expanded pool.
- Apply to matches where questions are generated after this feature (do not rewrite already-generated/resolved matchdays).

## Non-goals
- Goals and substitutions question types (deferred).
- Backfilling/regenerating questions for already-generated matchdays.
- Editing individual questions from admin UI (not currently available).
- Guaranteed live per-minute stat updates beyond normal sync cadence; provisional “in-play” correctness depends on synced stats.

## Constraints / decisions from conversation
- Test/verify on a separate test copy with test data, not on live prod game data.
- Mix stat questions into the regular pool (not as extra questions), so question count per match stays roughly similar.
- Thresholds: corners total 8.5, yellow cards total 3.5, shots on target total 8.5.
- Ties: “which team more” supports draw/поровну where applicable (corners, shots on target); possession treated as home/away (if exactly equal, treat as no “more” side — define explicitly as draw/not-a-hit rule or include draw; prefer draw option only if stat can tie).
- Random generation of question types each match.
- No prod DB changes or paid actions without explicit confirmation.

## Key risks
- sstats `games/list` lacks stats; per-match detail fetch increases API calls/rate-limit risk.
- Stat field names/availability may vary; need robust mapping and null handling.
- Resolve/evaluation logic exists in both TypeScript and SQL (`fn_question_answer`); must stay consistent.
- Existing open matchdays with already-generated questions won’t gain new types automatically.
