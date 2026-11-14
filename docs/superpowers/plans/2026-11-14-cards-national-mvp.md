# Cards (National Teams) MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an end-to-end national-teams cards MVP: a seeded national card set, packs (grant/open/reveal), collection, lineups on todayвЂ™s national matches, and lineup bonuses (auto DEF, manual FWD/MID/GK), integrated with existing matchday resolve and board mechanic 19.

**Architecture:** Extend the existing phase-2 card tables (`card_sets/cards/card_instances/packs/pack_openings`) via an additive migration to support card templates linked to national-team memberships, per-user pack inventory (`pack_grants`), and lineup/bonus tables. Keep game rules in pure/domain helpers, DB writes in repo/tx helpers and SQL (idempotent where required), server actions for mutations, and server components/clients for UI. Reuse existing dice tiers (`lib/game/dice.ts`), matchday resolution flow (`lib/repo/sync.ts` + `rpc_resolve_matchday`), and board event resolution (`lib/game/engine.ts`, `lib/repo/game-tx.ts`).

**Tech Stack:** Next.js (App Router, React, server actions), TypeScript, Postgres via `postgres` tagged template (`db()`), Supabase migrations/RLS, Zod validation, Vitest (`npm run test`), CSS in existing app styles.

**Spec:** `docs/superpowers/specs/2026-11-14-cards-national-mvp-design.md`  
**Tracker:** `docs/PROJECT_TRACKER.md`

## Constraints & Non-Goals (read first)
- **Scope:** national teams MVP only. Do not implement clubs, trades, auctions, achievements-as-pack-source, or 3D/FX/sound polish (separate iteration). Reveal must follow sequence country в†’ role в†’ rating в†’ player.
- **Prod safety:** never touch prod DB without explicit user confirmation; prod is `aotjinjlhetutqfvznow` only. New migrations must be applied to prod only with explicit confirmation, after review.
- **No secrets:** do not print tokens/keys.
- **Idempotency:** pack granting on matchday resolve/cell events and bonus awards must be idempotent (safe to re-run). No duplicate card instances of the same template for an owner within the national set.
- **Back-compat:** existing tables from `0001_schema.sql`/`0002_rls.sql` are in place; prefer additive `ALTER TABLE`/new tables over destructive rewrites.

## Approved Rules (encode exactly)
- Rarities: `common|rare|epic|legend`, odds 70/22/7/1, 1 card per pack.
- Pack sources (MVP): admin manual grant; matchday resolve for national matchday в†’ `gold` tier (>=2/3 correct, `tierFor`) gives 2 packs, else 1 pack per eligible participant; board mechanic `19` вЂњРџР°Рє РЅР° РІС‹Р±РѕСЂвЂќ (cells 14,26,48,62) grants 1 national pack.
- Lineups: per match, max 3 cards = 1 GK + 2 outfield (DEF/MID/FWD), cardвЂ™s national team must be playing that match; editable before kickoff, locked at/after kickoff.
- Bonuses (once per match per slotted card), points by rarity: Common 10 / Rare 20 / Epic 30 / Legend 40. FWD/MID: goal or assist, **manual (admin)**. DEF: playerвЂ™s team wins by **>= 2 goals** (FT), **auto**. GK: saves/good match, **manual (admin)**, no numeric threshold.

---

## Phase 1 вЂ” Schema, Types, and Domain Foundations

### Task 1: Add cards MVP migration (schema)

**Files:**
- Create: `supabase/migrations/0011_cards_national_mvp.sql`
- Read/reference: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_rls.sql`, `supabase/migrations/0007_reference_players.sql`

- [ ] **Step 1: Design the additive migration (write it down before coding)**
  - Extend `cards` to represent a national card template: add `national_team_id uuid references national_teams(id)`, `player_id uuid references players(id)`, `role_group text check (role_group in ('GK','DEF','MID','FWD'))`, `rating integer`, make `photo_url` the portrait source. Keep old columns nullable/unused; do not drop them.
  - Ensure `cards.rarity` remains compatible and `cards(set_id, ...)` can identify a template uniquely for dedupe (e.g. unique on `(set_id, player_id, national_team_id)` where not null, or a deterministic `template_key`).
  - Add `pack_grants` (user inventory of unopened packs): `id`, `season_id`, `profile_id`, `pack_id`, `source text check (source in ('admin','matchday','cell'))`, `source_ref text`/ids for idempotency (e.g. `matchday_id` or `cell_event_id`), `granted_at`, `opened_at`, `opened_opening_id`.
  - Extend `pack_openings` to link grant & be idempotent per grant: add `pack_grant_id uuid references pack_grants(id)` and/or unique constraint so one grant opens once; keep `idempotency_key` behavior.
  - Add `lineup_slots` (or `lineups`): `id`, `season_id`, `matchday_id`, `match_id`, `profile_id`, `card_instance_id`, `slot text check (slot in ('GK','OF1','OF2'))`, timestamps. Constraints: unique `(match_id, profile_id, slot)`; unique `(match_id, profile_id, card_instance_id)`; enforce GK-vs-outfield in app and/or via check/trigger if feasible.
  - Add `lineup_card_results`: `id`, `lineup_slot_id` unique, `profile_id`, `match_id`, `card_instance_id`, `rarity`, `points integer`, `awarded boolean`, `method text check (method in ('auto','manual'))`, `awarded_at`, `awarded_by` (nullable). Idempotent by `lineup_slot_id`.
  - Add helpful indexes (owner/season, unopened grants, lineups by match/profile, results by match).

- [ ] **Step 2: Create `0011_cards_national_mvp.sql`**

```sql
-- 0011: РєР°СЂС‚РѕС‡РєРё СЃР±РѕСЂРЅС‹С… MVP вЂ” С€Р°Р±Р»РѕРЅС‹/РїР°Рє-РёРЅРІРµРЅС‚Р°СЂСЊ/СЃРѕСЃС‚Р°РІС‹/Р±РѕРЅСѓСЃС‹.
-- РђРґРґРёС‚РёРІРЅРѕ Рє 0001/0002 (С„Р°Р·Р° 2-Р·Р°РіРѕС‚РѕРІРєРё).

-- --- card templates: РЅР°С†РёРѕРЅР°Р»СЊРЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚ ---
alter table cards
  add column if not exists player_id uuid references players(id),
  add column if not exists national_team_id uuid references national_teams(id),
  add column if not exists role_group text check (role_group in ('GK','DEF','MID','FWD')),
  add column if not exists rating integer;

-- РѕРґРёРЅ С€Р°Р±Р»РѕРЅ РёРіСЂРѕРєР° СЃР±РѕСЂРЅРѕР№ РІ СЃРµС‚Рµ (РґР»СЏ РґРµРґСѓРїР»РёРєР°С†РёРё/СЃРёРґР°)
create unique index if not exists cards_national_template_uidx
  on cards (set_id, player_id, national_team_id)
  where player_id is not null and national_team_id is not null;

-- --- РёРЅРІРµРЅС‚Р°СЂСЊ РЅРµРІСЃРєСЂС‹С‚С‹С… РїР°РєРѕРІ ---
create table if not exists pack_grants (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  pack_id uuid not null references packs(id),
  source text not null check (source in ('admin','matchday','cell')),
  matchday_id uuid references matchdays(id) on delete set null,
  cell_event_id uuid references cell_events(id) on delete set null,
  grant_index integer not null default 1,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  opened_opening_id uuid
);

-- РёРґРµРјРїРѕС‚РµРЅС‚РЅРѕСЃС‚СЊ РІС‹РґР°С‡: РЅРµ Р±РѕР»РµРµ N РіСЂР°РЅС‚РѕРІ РЅР° (РёСЃС‚РѕС‡РЅРёРє, СЂРµС„, РёРіСЂРѕРє) РїРѕ РёРЅРґРµРєСЃСѓ
create unique index if not exists pack_grants_matchday_uidx
  on pack_grants (matchday_id, profile_id, grant_index)
  where matchday_id is not null;
create unique index if not exists pack_grants_cell_uidx
  on pack_grants (cell_event_id, profile_id)
  where cell_event_id is not null;

create index if not exists pack_grants_open_idx
  on pack_grants (profile_id, season_id, opened_at);

-- СЃРІСЏР·РєР° РѕС‚РєСЂС‹С‚РёСЏ СЃ РіСЂР°РЅС‚РѕРј (РѕРґРёРЅ РіСЂР°РЅС‚ = РѕРґРЅРѕ РѕС‚РєСЂС‹С‚РёРµ)
alter table pack_openings
  add column if not exists pack_grant_id uuid references pack_grants(id);
create unique index if not exists pack_openings_grant_uidx
  on pack_openings (pack_grant_id)
  where pack_grant_id is not null;

-- Р·Р°РїСЂРµС‚ РґСѓР±Р»СЏ С€Р°Р±Р»РѕРЅР° РєР°СЂС‚С‹ Сѓ РІР»Р°РґРµР»СЊС†Р° РІ СЃРµР·РѕРЅРµ (РЅР°С†РёРѕРЅР°Р»СЊРЅС‹Р№ MVP)
create unique index if not exists card_instances_owner_card_uidx
  on card_instances (owner_id, season_id, card_id);

-- --- СЃРѕСЃС‚Р°РІС‹ РЅР° РјР°С‚С‡ ---
create table if not exists lineup_slots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  matchday_id uuid references matchdays(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  card_instance_id uuid not null references card_instances(id) on delete cascade,
  slot text not null check (slot in ('GK','OF1','OF2')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, profile_id, slot),
  unique (match_id, profile_id, card_instance_id)
);

create index if not exists lineup_slots_match_idx on lineup_slots (match_id, profile_id);

-- --- Р±РѕРЅСѓСЃ Р·Р° РІС‹СЃС‚Р°РІР»РµРЅРЅСѓСЋ РєР°СЂС‚Сѓ ---
create table if not exists lineup_card_results (
  id uuid primary key default gen_random_uuid(),
  lineup_slot_id uuid not null unique references lineup_slots(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  card_instance_id uuid not null references card_instances(id) on delete cascade,
  rarity text not null check (rarity in ('common','rare','epic','legend')),
  points integer not null default 0,
  awarded boolean not null default false,
  method text check (method in ('auto','manual')),
  reason text,
  awarded_at timestamptz,
  awarded_by uuid references profiles(id),
  unique (match_id, profile_id, card_instance_id)
);
```

> Adjust column names/types to fit existing conventions if needed, but keep semantics and idempotency keys.

- [ ] **Step 3: Extend RLS/policies for new tables/columns**

Append to `0011_cards_national_mvp.sql` (or a follow-up block) policies consistent with `0002_rls.sql`:
- `pack_grants`: enable RLS; select own or admin; mutations only via service/admin paths (no direct user insert/update/delete policies beyond what server needs вЂ” server uses `db()` service connection in this codebase; keep read policy `profile_id = auth.uid() or is_admin()`).
- `lineup_slots`: select own or admin; insert/update/delete own **only while allowed** is enforced in server logic (kickoff check) вЂ” simplest: allow authenticated users to manage own rows via RLS predicate `profile_id = auth.uid()` and enforce kickoff/team/role constraints in server action/transaction; or restrict to service-role only. Match existing pattern (game state writes typically go through server).
- `lineup_card_results`: select own or admin; writes admin/service only.
- Ensure `grant select` for new readable tables to `authenticated` as appropriate.
- Decide and document: if server uses service-role `db()`, RLS may be bypassed; still add policies for defense-in-depth.

- [ ] **Step 4: Sanity-check migration SQL locally (syntax/shape)**

Run: `Get-Content supabase/migrations/0011_cards_national_mvp.sql` (visual check) and, if a local DB workflow exists, apply to a local/dev db; otherwise rely on SQL review. Do **not** apply to prod in this step.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_cards_national_mvp.sql
git commit -m "db: add cards national MVP tables and constraints"
```

### Task 2: Domain constants and pure helpers (odds, points, eligibility)

**Files:**
- Create: `lib/game/cards.ts`
- Create: `tests/unit/cards.test.ts`
- Modify (optional, only if needed): `lib/types.ts`

- [ ] **Step 1: Write failing unit tests for pure rules**

```ts
// tests/unit/cards.test.ts
import { describe, expect, it } from 'vitest';
import { CARD_RARITY_ODDS, LINEUP_POINTS, matchdayPackCount, rollRarity, canSlotCard } from '@/lib/game/cards';

describe('card rules', () => {
  it('defines 70/22/7/1 odds summing to 100', () => {
    const sum = Object.values(CARD_RARITY_ODDS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('maps rarity to lineup points', () => {
    expect(LINEUP_POINTS).toEqual({ common: 10, rare: 20, epic: 30, legend: 40 });
  });

  it('awards 2 packs for gold tier else 1', () => {
    expect(matchdayPackCount('gold')).toBe(2);
    expect(matchdayPackCount('silver')).toBe(1);
    expect(matchdayPackCount('bronze')).toBe(1);
    expect(matchdayPackCount('wood')).toBe(1);
    expect(matchdayPackCount(null)).toBe(1);
  });

  it('rollRarity respects odds deterministically at edges', () => {
    expect(rollRarity(() => 0)).toBe('common');
    expect(rollRarity(() => 0.699999)).toBe('common');
    expect(rollRarity(() => 0.700001)).toBe('rare');
    expect(rollRarity(() => 0.999999)).toBe('legend');
  });

  it('enforces GK slot for GK role_group only', () => {
    expect(canSlotCard({ slot: 'GK', roleGroup: 'GK' })).toBe(true);
    expect(canSlotCard({ slot: 'GK', roleGroup: 'DEF' })).toBe(false);
    expect(canSlotCard({ slot: 'OF1', roleGroup: 'MID' })).toBe(true);
    expect(canSlotCard({ slot: 'OF1', roleGroup: 'GK' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cards.test.ts`  
Expected: FAIL (module `@/lib/game/cards` missing / functions undefined).

- [ ] **Step 3: Implement minimal pure helpers**

```ts
// lib/game/cards.ts
import type { DiceTier } from '@/lib/game/dice';

export type CardRarity = 'common' | 'rare' | 'epic' | 'legend';
export type RoleGroup = 'GK' | 'DEF' | 'MID' | 'FWD';
export type LineupSlotKind = 'GK' | 'OF1' | 'OF2';

export const CARD_RARITY_ODDS: Record<CardRarity, number> = {
  common: 70,
  rare: 22,
  epic: 7,
  legend: 1,
};

export const LINEUP_POINTS: Record<CardRarity, number> = {
  common: 10,
  rare: 20,
  epic: 30,
  legend: 40,
};

export function matchdayPackCount(tier: DiceTier | null): number {
  return tier === 'gold' ? 2 : 1;
}

export function rollRarity(random: () => number): CardRarity {
  const r = Math.min(0.999999999, Math.max(0, random())) * 100;
  let acc = 0;
  for (const [rarity, pct] of Object.entries(CARD_RARITY_ODDS) as Array<[CardRarity, number]>) {
    acc += pct;
    if (r < acc) return rarity;
  }
  return 'legend';
}

export function canSlotCard(input: { slot: LineupSlotKind; roleGroup: RoleGroup }): boolean {
  if (input.slot === 'GK') return input.roleGroup === 'GK';
  return input.roleGroup !== 'GK';
}

export function isOutfield(role: RoleGroup): boolean {
  return role !== 'GK';
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/cards.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game/cards.ts tests/unit/cards.test.ts
git commit -m "feat(cards): add rarity odds, lineup points, and slot helpers"
```

### Task 3: Types and view models for cards/packs/lineups

**Files:**
- Modify: `lib/types.ts`
- (If repo mappers exist) Modify: `lib/repo/mappers.ts` or create `lib/repo/cards.ts` (types only in this step)

- [ ] **Step 1: Add view/model types needed by UI and actions**

Add (names may vary to match codebase style, but include essentials):
```ts
export type CardRarity = 'common' | 'rare' | 'epic' | 'legend';
export type CardTemplateView = { id: string; playerName: string; nationalTeam: string; nationalTeamSlug: string; roleGroup: 'GK'|'DEF'|'MID'|'FWD'; rating: number; photoUrl: string | null; rarity: CardRarity };
export type OwnedCardView = CardTemplateView & { instanceId: string; obtainedAt: string };
export type PackGrantView = { id: string; packTitle: string; source: 'admin'|'matchday'|'cell'; createdAt: string };
export type LineupSlotView = { matchId: string; slot: 'GK'|'OF1'|'OF2'; card: OwnedCardView | null };
export type MatchLineupView = { matchId: string; homeName: string; awayName: string; kickoffUtc: string; locked: boolean; slots: LineupSlotView[] };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit --pretty false`  
Expected: PASS (or only unrelated pre-existing issues).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(cards): add card, pack, and lineup view types"
```

---

## Phase 2 вЂ” Seed and Pack Inventory/Opening

### Task 4: National set & card seeding (idempotent)

**Files:**
- Create: `lib/repo/cards-seed.ts` (or `scripts/seed-national-cards.ts` invoked by repo helper)
- Create: `supabase/migrations/0012_seed_national_cards.sql` (data seed) OR a server/admin action to seed вЂ” prefer a reproducible SQL seed/migration for the national set + pack definition, and a scriptable function to materialize `cards` from `player_national_team_memberships`.

- [ ] **Step 1: Decide seed strategy (document in commit/PR)**
  - Create/ensure a `card_sets` row: kind `national`, title e.g. вЂњРЎР±РѕСЂРЅС‹РµвЂќ, active.
  - Create/ensure a `packs` row for that set: title вЂњРџР°Рє СЃР±РѕСЂРЅС‹С…вЂќ, `cards_count 1`, `odds {"common":70,"rare":22,"epic":7,"legend":1}`, active.
  - Generate `cards` rows for each (player, national_team, membership role_group) in existing reference data: assign deterministic rating (e.g. hash/name-based 60вЂ“92 spread) and rarity distribution roughly matching odds (deterministic assignment) so pool is balanced; `photo_url` null/placeholder initially. Use stable unique key `(set_id, player_id, national_team_id)`.

- [ ] **Step 2: Implement idempotent seed**

Example shape (adapt to actual columns):
```sql
-- 0012_seed_national_cards.sql
insert into card_sets (id, kind, title, is_active)
values ('00000000-0000-0000-0000-00000000c001', 'national', 'РЎР±РѕСЂРЅС‹Рµ', true)
on conflict (id) do update set title = excluded.title, is_active = true;

insert into packs (id, set_id, title, cost_points, cards_count, odds, is_active)
values (
  '00000000-0000-0000-0000-00000000a001',
  '00000000-0000-0000-0000-00000000c001',
  'РџР°Рє СЃР±РѕСЂРЅС‹С…', 0, 1,
  '{"common":70,"rare":22,"epic":7,"legend":1}'::jsonb,
  true
)
on conflict (id) do update set odds = excluded.odds, is_active = true;

-- Materialize templates from memberships (idempotent)
insert into cards (set_id, player_id, national_team_id, player_name, nationality, position, role_group, rating, rarity, photo_url, external_player_id)
select
  '00000000-0000-0000-0000-00000000c001',
  m.player_id,
  m.national_team_id,
  p.name,
  nt.name,
  m.role_group,
  m.role_group,
  (60 + (abs(hashtext(p.name || nt.slug)) % 33))::int as rating,
  (case (abs(hashtext(p.name || ':' || nt.slug)) % 100)
     when 99 then 'legend'
     when 92 then 'legend' -- adjust to ~1% deterministically
     else case
       when (abs(hashtext(p.name || ':' || nt.slug)) % 100) < 70 then 'common'
       when (abs(hashtext(p.name || ':' || nt.slug)) % 100) < 92 then 'rare'
       when (abs(hashtext(p.name || ':' || nt.slug)) % 100) < 99 then 'epic'
       else 'legend'
     end
   end) as rarity,
  null,
  m.player_id::text || ':' || m.national_team_id::text
from player_national_team_memberships m
join players p on p.id = m.player_id
join national_teams nt on nt.id = m.national_team_id
on conflict (set_id, player_id, national_team_id) do update
  set player_name = excluded.player_name,
      nationality = excluded.nationality,
      position = excluded.position,
      role_group = excluded.role_group,
      rating = excluded.rating,
      rarity = excluded.rarity;
```

> Refine rarity bucketing to be deterministic and roughly 70/22/7/1. If `cards.id`/unique constraints differ, adjust to match `0011`.

- [ ] **Step 3: Verify seed produces rows (local/dev or via query plan)**

Run a read-only check query (local DB): count cards per rarity and total memberships vs templates. If no local DB, at minimum ensure SQL parses and logic is sound.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_seed_national_cards.sql
git commit -m "db: seed national card set, pack, and templates"
```

### Task 5: Pack grant repository helpers (idempotent)

**Files:**
- Create: `lib/repo/cards.ts`
- Create: `tests/unit/cards-repo-helpers.test.ts` (pure parts) and/or integration-oriented tests if harness exists

- [ ] **Step 1: Define pure selection logic for opening (no-duplicate)**

In `lib/game/cards.ts` (or `lib/repo/cards.ts` pure section), add:
- `pickCardTemplate(availableByRarity, rarity, random)` вЂ” choose uniformly within rarity bucket; fallback strategy when bucket empty (deterministic downgrade/any-available) but never a duplicate of owned templates.
- `hasCollectibleLeft(total, owned)` guard.

Write unit tests for: falls back when rolled rarity exhausted; returns null/explicit outcome when nothing left.

- [ ] **Step 2: Implement repo functions (service DB)**

```ts
// lib/repo/cards.ts (shape)
import { db } from '@/lib/db';
import { rollRarity, type CardRarity } from '@/lib/game/cards';

export async function grantNationalPack(opts: { seasonId: string; profileId: string; packId: string; source: 'admin'|'matchday'|'cell'; matchdayId?: string; cellEventId?: string; grantIndex?: number }) { /* insert pack_grants idempotently */ }
export async function listUnopenedPacks(profileId: string, seasonId: string) { /* join pack_grants+packs */ }
export async function openPackGrant(opts: { grantId: string; profileId: string; seasonId: string; random?: () => number }) { /* tx: lock grant, ensure unopened, select non-owned templates by rarity, create card_instance + pack_opening, mark grant opened */ }
export async function listCollection(profileId: string, seasonId: string) { /* card_instances joined to cards + national_teams */ }
```

Key behaviors to implement:
- `openPackGrant` runs in `db().begin` (or `sql.begin`), `select ... for update` on grant, verifies ownership/season/unopened.
- Determine owned `card_id`s for owner+season+set; pick rarity via `rollRarity`, select random available template in that rarity not in owned; if bucket empty, fall back to any available rarity (document choice) to honor вЂњno duplicatesвЂќ when possible.
- If no templates left at all, do **not** create duplicate: mark grant as opened-without-card in a safe way (e.g. `pack_openings` with `card_instance_id` null and a status note) or refund rule вЂ” choose simplest explicit behavior and record in tracker/spec notes.
- Insert `card_instances` (owner, season, card_id, obtained_from 'pack') and `pack_openings` linked to grant; update grant `opened_at`.

- [ ] **Step 3: Typecheck and unit-test pure helpers**

Run: `npx vitest run tests/unit/cards.test.ts tests/unit/cards-repo-helpers.test.ts` and `npx tsc -p tsconfig.json --noEmit --pretty false`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/repo/cards.ts lib/game/cards.ts tests
git commit -m "feat(cards): add pack grants, opening, and collection repo helpers"
```

---

## Phase 3 вЂ” Granting Integration (Matchday, Cell 19, Admin)

### Task 6: Grant packs on national matchday resolve

**Files:**
- Modify: `lib/repo/sync.ts` (or extract helper used by it)
- Create: `lib/repo/cards-grants.ts` (optional, to keep sync lean)
- Modify/tests: `tests` вЂ” add unit test for вЂњwho gets how many packsвЂќ given tiers if logic is extracted purely

- [ ] **Step 1: Identify hook point**

After a successful `rpc_resolve_matchday` (returns ok) for a matchday, compute per-participant daily tier and grant packs **idempotently** (unique by `matchday_id, profile_id, grant_index`). Only for matchdays classified as national (MVP: UNL/in-scope national) вЂ” implement a helper `isNationalMatchday(matchdayId)` (e.g. based on matchesвЂ™ league/provider/competition in scope).

- [ ] **Step 2: Implement tier lookup + grant**

- Query participants/results for the matchday: reuse dice/answer aggregates if available (e.g. `dice` rows created by resolve for source matchday, or recompute via same logic as `diceForDay`/stored q_total & answers). Prefer deriving tier from granted base dice tier for that matchday/profile if persisted; else compute from answers/questions consistently with `lib/game/dice.ts`.
- For each eligible participant: `count = matchdayPackCount(tier)` (goldв†’2 else 1). Insert `pack_grants` with `source='matchday'`, `matchday_id`, `grant_index` 1..count using `on conflict do nothing`.
- Wrap in same transactional context as post-resolve step where safe, or run immediately after resolve with idempotent inserts.

- [ ] **Step 3: Add targeted test for count mapping (pure) and run**

Run: `npx vitest run tests/unit/cards.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/repo/sync.ts lib/repo/cards-grants.ts lib/repo/cards.ts
git commit -m "feat(cards): grant national packs on matchday resolve by dice tier"
```

### Task 7: Grant pack on board mechanic 19

**Files:**
- Modify: `lib/game/engine.ts` (update `case '19'` log text to reflect grant when implemented, if desired)
- Modify: `lib/repo/game-tx.ts` (after resolving/moving to a cell with code `19`, create a cell grant idempotently)
- Modify: `lib/game/catalog.ts` (update copy/note from вЂњРїРѕР·Р¶РµвЂќ to MVP behavior for national pack) вЂ” optional but user-facing

- [ ] **Step 1: Implement grant in resolution flow**

In `moveAndResolve` (or immediately after inserting `cell_events`), when landed cell mechanic code is `19` and an `eventId` exists:
- Look up active national pack for season.
- Insert `pack_grants` with `source='cell'`, `cell_event_id = eventId`, `profile_id/season_id` вЂ” rely on unique `(cell_event_id, profile_id)` for idempotency.
- Keep event resolution/pending behavior unchanged (mechanic 19 is instant, no awaiting choice).

- [ ] **Step 2: Write/update a unit or integration-style check if feasible**

If unit tests cover `resolveCell`, update expected log for `19` or keep logic testable by extracting вЂњshould grant on 19вЂќ helper. Run: `npx vitest run`.

- [ ] **Step 3: Manual reasoning check**

Ensure repeated resolution of the same event/grant path cannot duplicate packs (unique index). Ensure it works for cells 14,26,48,62 (all mechanic 19 per board).

- [ ] **Step 4: Commit**

```bash
git add lib/repo/game-tx.ts lib/game/engine.ts lib/game/catalog.ts
git commit -m "feat(cards): grant national pack on cell mechanic 19"
```

### Task 8: Admin actions вЂ” grant pack & manual lineup bonus

**Files:**
- Modify: `lib/actions/admin-schemas.ts`
- Modify: `lib/actions/admin.ts`
- Modify: `lib/repo/admin-tools.ts`
- Modify: `app/(game)/admin/AdminTools.tsx` (and/or a dedicated admin cards block)

- [ ] **Step 1: Add schemas**

```ts
export const packGrantSchema = z.object({ profileId: z.string().uuid(), count: z.coerce.number().int().min(1).max(20).default(1) });
export const lineupBonusManualSchema = z.object({ lineupSlotId: z.string().uuid(), triggered: z.boolean() });
```

- [ ] **Step 2: Implement repo/admin operations**

- `grantPackToProfile(adminId, { profileId, count })`: verify profile in active season, insert N `pack_grants` (source admin) for active national pack/season.
- `awardManualLineupBonus(adminId, { lineupSlotId, triggered })`: load slot+card+match, ensure eligible for manual (FWD/MID/GK per rule) and match is final/appropriate per spec (define: allow after kickoff/FT as sensible; at minimum require match FT for consistency), compute points by rarity, upsert `lineup_card_results` awarded/triggered idempotently and write `score_events`/points if your system tracks lineup points there (integrate with existing scoring model вЂ” inspect `score_events` usage and add a `kind` like `lineup_bonus` if needed).

- [ ] **Step 3: Wire server actions and UI**

- Add actions `grantPackAction`, `awardLineupBonusAction` in `lib/actions/admin.ts` with admin check + `revalidatePath`.
- Extend `AdminTools.tsx` with: select player в†’ grant N packs; list pending/eligible lineup slots (todayвЂ™s/FT matches) for manual FWD/MID/GK with вЂњР·Р°СЃС‡РёС‚Р°С‚СЊ Р±РѕРЅСѓСЃвЂќ toggle/button showing rarity/points.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/admin-schemas.ts lib/actions/admin.ts lib/repo/admin-tools.ts app/(game)/admin/AdminTools.tsx
git commit -m "feat(admin): grant national packs and award manual lineup bonuses"
```

---

## Phase 4 вЂ” Lineups & Auto DEF Bonus

### Task 9: Lineup domain logic and repository

**Files:**
- Create: `lib/repo/lineups.ts`
- Modify: `lib/game/cards.ts` (DEF auto condition helper, pure)
- Create: `tests/unit/lineup-rules.test.ts`

- [ ] **Step 1: Write failing tests for pure lineup/DEF rules**

```ts
import { describe, expect, it } from 'vitest';
import { defBonusTriggered } from '@/lib/game/cards';

describe('DEF auto bonus', () => {
  it('triggers when team wins by >= 2 goals', () => {
    expect(defBonusTriggered({ teamGoals: 3, oppGoals: 1 })).toBe(true);
    expect(defBonusTriggered({ teamGoals: 2, oppGoals: 0 })).toBe(true);
    expect(defBonusTriggered({ teamGoals: 2, oppGoals: 1 })).toBe(false);
    expect(defBonusTriggered({ teamGoals: 1, oppGoals: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Implement helpers and repo**

- `defBonusTriggered({ teamGoals, oppGoals }) => teamGoals - oppGoals >= 2`.
- `listLineupMatches(seasonId, dateOrToday)`: matches of todayвЂ™s (or relevant) matchday with kickoff/status and team identities.
- `getMyLineup(matchId, profileId)`, `upsertLineupSlot(...)`, `removeLineupSlot(...)` in a transaction:
  - validate match not started (`now < kickoff_utc`), card owned by user, cardвЂ™s `national_team` matches home or away team of match, slot rules (GK only GK, OF1/OF2 non-GK), max 3/roles satisfied, no card reuse conflicts per constraints.
  - Team-to-national_team matching: use reliable mapping available (ids/slugs/names) вЂ” inspect `matches`/reference tables; implement a deterministic matcher and document limitations.

- [ ] **Step 3: Run tests and typecheck**

Run: `npx vitest run tests/unit/lineup-rules.test.ts tests/unit/cards.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/repo/lineups.ts lib/game/cards.ts tests/unit/lineup-rules.test.ts
git commit -m "feat(cards): lineup repository and DEF bonus rules"
```

### Task 10: Auto-award DEF bonus on final match result

**Files:**
- Modify: `lib/repo/sync.ts` or create `lib/repo/lineup-bonus.ts`
- Hook point: when a match becomes `FT` (during sync/advance) or when matchday resolves

- [ ] **Step 1: Implement idempotent auto-award**

- For each FT match with known scores, find `lineup_slots` whose card `role_group = 'DEF'` and whose card national team equals the winning side with margin >= 2.
- Insert/upsert `lineup_card_results` (method `auto`, awarded true, points by rarity) once per `lineup_slot_id`; award points into `score_events`/player totals consistent with existing scoring (idempotent unique key).

- [ ] **Step 2: Run targeted verification**

Run: `npx vitest run` (or focused tests added for helper) and `npx tsc -p tsconfig.json --noEmit --pretty false`.

- [ ] **Step 3: Commit**

```bash
git add lib/repo/sync.ts lib/repo/lineup-bonus.ts
git commit -m "feat(cards): auto-award DEF lineup bonus on final score"
```

---

## Phase 5 вЂ” Player UI (Collection, Packs, Lineups)

### Task 11: Navigation and routes

**Files:**
- Modify: `components/shell/Header.tsx`
- Create: `app/(game)/collection/page.tsx`, `app/(game)/collection/CollectionClient.tsx` (or equivalent)
- Create: `app/(game)/lineups/page.tsx`, `app/(game)/lineups/LineupsClient.tsx`
- (Optional) `app/(game)/packs` or integrate pack opening in collection вЂ” choose simplest UX consistent with spec

- [ ] **Step 1: Add nav entries**

Add tabs/links for В«РљРѕР»Р»РµРєС†РёСЏВ» and В«РЎРѕСЃС‚Р°РІС‹В» in header/navigation (icons/labels consistent with existing style), visible to authenticated players as appropriate.

- [ ] **Step 2: Create server pages fetching data**

- Collection page: load unopened pack grants count/list and owned cards for current user+season.
- Lineups page: load todayвЂ™s relevant matches and current user lineup slots.

- [ ] **Step 3: Commit**

```bash
git add components/shell/Header.tsx app/(game)/collection app/(game)/lineups
git commit -m "feat(ui): add collection and lineups routes and navigation"
```

### Task 12: Collection and pack opening UI (reveal sequence)

**Files:**
- Modify/Create: `app/(game)/collection/CollectionClient.tsx`
- Create: `components/cards/*` (e.g. `PackOpenReveal.tsx`, `CardTile.tsx`) as needed
- Create: `lib/actions/cards.ts` (server actions: `openPackAction`)

- [ ] **Step 1: Implement collection grid**

Show owned cards grouped/sortable by rarity/team/role; display name, national team, role, rating, photo/placeholder, rarity styling.

- [ ] **Step 2: Implement pack opening flow with required sequence**

- List unopened packs with вЂњРћС‚РєСЂС‹С‚СЊвЂќ.
- On open: call server action, receive revealed card payload; animate/reveal steps in order **РЎР±РѕСЂРЅР°СЏ в†’ СЂРѕР»СЊ/РїРѕР·РёС†РёСЏ в†’ СЂРµР№С‚РёРЅРі в†’ РёРіСЂРѕРє (РїРѕСЂС‚СЂРµС‚/РёРјСЏ)** (state machine/timed steps). Keep implementation ready for future 3D/FX/sound (separate components/hooks), but deliver clear stepped reveal now.
- Handle вЂњno card available / collection completeвЂќ response gracefully (no duplicate).

- [ ] **Step 3: Typecheck and quick manual sanity**

Run: `npx tsc -p tsconfig.json --noEmit --pretty false`.

- [ ] **Step 4: Commit**

```bash
git add app/(game)/collection components/cards lib/actions/cards.ts
git commit -m "feat(ui): collection view and staged pack opening reveal"
```

### Task 13: Lineups UI

**Files:**
- Modify/Create: `app/(game)/lineups/LineupsClient.tsx`
- Create: `lib/actions/lineups.ts`
- Modify: `lib/repo/lineups.ts` as needed for UI queries

- [ ] **Step 1: Implement match list and slot editor**

- Show todayвЂ™s/active matchday matches; for each match 3 slots (GK, OF1, OF2).
- Card picker shows only eligible owned cards (correct national team in match, correct role for slot, not locked/conflicting).
- Disable edits when match started/locked (kickoff passed); show lock state.

- [ ] **Step 2: Implement save/remove actions**

Server actions call repo with validations; revalidate lineups/collection paths.

- [ ] **Step 3: Show bonus/result state (read-only)**

Display if bonus awarded/pending and points (from `lineup_card_results`) when available.

- [ ] **Step 4: Commit**

```bash
git add app/(game)/lineups lib/actions/lineups.ts lib/repo/lineups.ts
git commit -m "feat(ui): lineup editor with kickoff lock and eligibility rules"
```

---

## Phase 6 вЂ” Verification, Docs, and Rollout

### Task 14: Automated checks and regression pass

**Files:**
- Modify: tests as needed for updated behavior (e.g. mechanic 19 log expectations)

- [ ] **Step 1: Run full relevant checks**

Run: `npx vitest run`  
Expected: PASS (all existing + new tests).

Run: `npx tsc -p tsconfig.json --noEmit --pretty false`  
Expected: PASS.

- [ ] **Step 2: Fix any regressions minimally**

Keep changes scoped to cards MVP and necessary compatibility updates.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: align checks for cards national MVP"
```

### Task 15: Update tracker and rollout notes

**Files:**
- Modify: `docs/PROJECT_TRACKER.md`

- [ ] **Step 1: Record implementation status and debts**

Update tracker with: completed cards MVP scope, migrations added (`0011`, `0012`), known follow-ups (3D/FX/sound reveal polish, club context, achievements/predictions-as-sources, full-collection fallback policy, team-nameв†”national_team mapping robustness, GK manual UX details), and reminder that prod migration requires explicit confirmation.

- [ ] **Step 2: Commit**

```bash
git add docs/PROJECT_TRACKER.md
git commit -m "docs: update tracker with cards MVP implementation status"
```

### Task 16: Prod migration & deploy checklist (operator steps, not automatic)

- [ ] **Step 1: Prepare rollout**
  - Ensure branch pushed and Vercel deploy green.
  - Review `0011`/`0012` for idempotency and compatibility with existing `0001` card tables/data.

- [ ] **Step 2: Apply migrations to prod ONLY with explicit user confirmation**
  - Target: Supabase `aotjinjlhetutqfvznow`.
  - Apply `0011_cards_national_mvp.sql`, then `0012_seed_national_cards.sql`.
  - Verify: card set/pack exist, templates seeded, policies/indexes created.

- [ ] **Step 3: Smoke test**
  - Admin grants pack в†’ user sees grant в†’ opens pack в†’ reveal sequence correct в†’ card appears in collection.
  - Set lineup before kickoff (valid GK+2 OF, correct team) and confirm lock after kickoff.
  - Trigger/record manual bonus and verify auto DEF on a finished match with >=2 goal margin.
  - Confirm matchday resolve grants 1/2 packs by tier for a national day (idempotent on rerun) and cell 19 grants pack.

---

## Notes for Implementer
- **Team matching:** matches store `home_name/away_name`; national teams stored in `national_teams`. Implement robust normalization/mapping (reuse `lib/data/team-names.ts` patterns if present) and fail closed (disallow slot/auto-bonus) when ambiguous rather than mis-attributing.
- **Active season:** scope grants/instances/lineups to the active season (`seasons.status='active'`) consistently.
- **Scoring integration:** inspect `score_events` and how points aggregate; add a dedicated lineup-bonus event kind to avoid double-counting and to keep idempotency.
- **RLS vs service DB:** this project uses `db()` (server-side); still add RLS for safety but rely on server-side authorization checks (admin/owner/kickoff) as primary enforcement.
- **UI polish:** prioritize correctness, mobile usability, and the required reveal order; leave advanced 3D/FX/sound to the follow-up visual iteration tracked separately.
- **Do not rewrite** existing/resolved matchdays except through idempotent, intended grant logic.
