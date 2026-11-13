/**
 * Маппинг строк БД в типы представления (`lib/types.ts`).
 *
 * Живёт отдельно от SQL, чтобы проверяться юнит-тестами на фикстурах:
 * живой базы до подключения ключей нет, а форма снимка важна для экранов.
 * Правила:
 *  - даты нормализуются в ISO, даты календаря приходят текстом `YYYY-MM-DD`;
 *  - числовые агрегаты Postgres может вернуть строкой (bigint) — приводим к number;
 *  - `correctOption` отдаётся только у резолвнутых вопросов;
 *  - jsonb-поля валидируются и при мусоре не роняют страницу.
 */

import { z } from 'zod';
import type { ActiveEffect, EffectCode } from '@/lib/game/engine';
import type { DiceTier } from '@/lib/game/dice';
import type {
  ActivityView,
  CellView,
  MatchView,
  MatchdayView,
  MeView,
  PendingChoiceView,
  PlayerView,
  QuestionView,
  Role,
  SeasonSnapshot,
  SeasonView,
} from '@/lib/types';

// ---------- строки ----------

export type SeasonRow = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'active' | 'finished';
  starts_on: string;
  ends_on: string;
};

export type PlayerRow = {
  profile_id: string;
  nickname: string;
  avatar_url: string | null;
  role: Role;
  position: number | string;
  finished_at: string | Date | null;
  points: number | string | null;
  answered: number | string | null;
  correct: number | string | null;
  last_action: string | null;
  dice_wood: number | string | null;
  dice_bronze: number | string | null;
  dice_silver: number | string | null;
  dice_gold: number | string | null;
  favorite_club_id: string | null;
  favorite_club_name: string | null;
  favorite_national_team_id: string | null;
  favorite_national_team_name: string | null;
  favorite_player_id: string | null;
  favorite_player_name: string | null;
};

export type EffectRow = {
  profile_id: string;
  code: string;
  charges: number | string | null;
};

export type CellRow = {
  idx: number | string;
  kind: CellView['kind'];
  mechanic_code: string | null;
};

export type MatchdayRow = {
  id: string;
  game_date: string;
  opens_at: string | Date;
  closes_at: string | Date;
  status: MatchdayView['status'];
  q_total: number | string | null;
};

export type MatchRow = {
  id: string;
  league_code: string;
  league_title: string;
  home_name: string;
  home_logo: string | null;
  away_name: string;
  away_logo: string | null;
  kickoff_utc: string | Date;
  status: MatchView['status'];
  minute: number | string | null;
  home_score: number | string | null;
  away_score: number | string | null;
  in_scope: boolean;
  question_count: number | string | null;
  my_answered: number | string | null;
};

export type QuestionRow = {
  id: string;
  match_id: string;
  kind: QuestionView['kind'];
  prompt: string;
  options: unknown;
  is_bonus: boolean;
  locks_at: string | Date;
  status: QuestionView['status'];
  correct_option: string | null;
  my_choice: string | null;
  distribution: unknown;
};

export type ActivityRow = {
  id: string | number;
  kind: string;
  message: string;
  created_at: string | Date;
};

export type PendingRow = {
  id: string;
  event_id: string;
  kind: string;
  payload: unknown;
  expires_at: string | Date;
};

// ---------- утилиты ----------

const DATE_FALLBACK = '1970-01-01T00:00:00.000Z';

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toIsoOr(value: string | Date | null | undefined, fallback: string): string {
  return toIso(value) ?? fallback;
}

const OPTIONS_SCHEMA = z
  .array(z.object({ key: z.string().min(1), label: z.string().min(1) }).passthrough())
  .min(1);

export function parseOptions(value: unknown): QuestionView['options'] {
  const parsed = OPTIONS_SCHEMA.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((option) => ({ key: option.key, label: option.label }));
}

const DISTRIBUTION_SCHEMA = z.record(z.string(), z.union([z.number(), z.string()]));

export function parseDistribution(value: unknown): Record<string, number> | null {
  const parsed = DISTRIBUTION_SCHEMA.safeParse(value);
  if (!parsed.success) return null;
  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([key, count]) => [key, toNumber(count)]));
}

const EFFECT_CODES = new Set<EffectCode>(['tribuny', 'gazon', 'shieldki', 'yellow_card', 'tactics']);
const DICE_TIERS: DiceTier[] = ['wood', 'bronze', 'silver', 'gold'];
const ACTIVITY_KINDS = new Set<ActivityView['kind']>([
  'roll',
  'positive',
  'negative',
  'neutral',
  'system',
  'reward',
]);
const PENDING_KINDS = new Set<PendingChoiceView['kind']>(['var', 'passage', 'locker', 'tactics']);

// ---------- мапперы ----------

export function toSeasonView(row: SeasonRow): SeasonView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

export function toEffectRows(rows: EffectRow[]): Map<string, ActiveEffect[]> {
  const byProfile = new Map<string, ActiveEffect[]>();

  for (const row of rows) {
    if (!EFFECT_CODES.has(row.code as EffectCode)) continue;
    const charges = toNumber(row.charges);
    if (charges <= 0) continue;
    const list = byProfile.get(row.profile_id) ?? [];
    list.push({ code: row.code as EffectCode, charges });
    byProfile.set(row.profile_id, list);
  }

  return byProfile;
}

export function toPlayerViews(rows: PlayerRow[], effectRows: EffectRow[], meId: string | null): PlayerView[] {
  const effects = toEffectRows(effectRows);

  return rows.map((row) => {
    const dice: Record<DiceTier, number> = {
      wood: toNumber(row.dice_wood),
      bronze: toNumber(row.dice_bronze),
      silver: toNumber(row.dice_silver),
      gold: toNumber(row.dice_gold),
    };

    return {
      profileId: row.profile_id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      role: row.role,
      position: toNumber(row.position),
      finishedAt: toIso(row.finished_at),
      points: toNumber(row.points),
      answered: toNumber(row.answered),
      correct: toNumber(row.correct),
      effects: effects.get(row.profile_id) ?? [],
      dice,
      lastAction: row.last_action,
      isMe: row.profile_id === meId,
      favoriteClub:
        row.favorite_club_id && row.favorite_club_name
          ? { id: row.favorite_club_id, name: row.favorite_club_name }
          : null,
      favoriteNationalTeam:
        row.favorite_national_team_id && row.favorite_national_team_name
          ? { id: row.favorite_national_team_id, name: row.favorite_national_team_name }
          : null,
      favoritePlayer:
        row.favorite_player_id && row.favorite_player_name
          ? { id: row.favorite_player_id, name: row.favorite_player_name }
          : null,
    };
  });
}

export function toMatchdayView(row: MatchdayRow | null): MatchdayView | null {
  if (!row) return null;
  return {
    id: row.id,
    gameDate: row.game_date,
    opensAt: toIsoOr(row.opens_at, DATE_FALLBACK),
    closesAt: toIsoOr(row.closes_at, DATE_FALLBACK),
    status: row.status,
    qTotal: row.q_total === null ? null : toNumber(row.q_total),
  };
}

export function toCellViews(rows: CellRow[]): CellView[] {
  return rows.map((row) => ({
    idx: toNumber(row.idx),
    kind: row.kind,
    mechanicCode: row.mechanic_code,
  }));
}

export function toMatchView(row: MatchRow): MatchView {
  return {
    id: row.id,
    leagueCode: row.league_code,
    leagueTitle: row.league_title,
    homeName: row.home_name,
    homeLogo: row.home_logo,
    awayName: row.away_name,
    awayLogo: row.away_logo,
    kickoffUtc: toIsoOr(row.kickoff_utc, DATE_FALLBACK),
    status: row.status,
    minute: row.minute === null ? null : toNumber(row.minute),
    homeScore: row.home_score === null ? null : toNumber(row.home_score),
    awayScore: row.away_score === null ? null : toNumber(row.away_score),
    questionCount: toNumber(row.question_count),
    myAnswered: toNumber(row.my_answered),
    inPredictions: row.in_scope,
  };
}

export function toQuestionView(row: QuestionRow): QuestionView {
  const resolved = row.status === 'resolved';

  return {
    id: row.id,
    matchId: row.match_id,
    kind: row.kind,
    prompt: row.prompt,
    options: parseOptions(row.options),
    isBonus: row.is_bonus,
    locksAt: toIsoOr(row.locks_at, DATE_FALLBACK),
    status: row.status,
    correctOption: resolved ? row.correct_option : null,
    myChoice: row.my_choice,
    distribution: row.status === 'open' ? null : parseDistribution(row.distribution),
  };
}

export function toActivityViews(rows: ActivityRow[]): ActivityView[] {
  return rows.map((row) => ({
    id: String(row.id),
    kind: ACTIVITY_KINDS.has(row.kind as ActivityView['kind'])
      ? (row.kind as ActivityView['kind'])
      : 'system',
    message: row.message,
    createdAt: toIsoOr(row.created_at, DATE_FALLBACK),
  }));
}

export function toPendingChoice(row: PendingRow | null): PendingChoiceView | null {
  if (!row) return null;
  if (!PENDING_KINDS.has(row.kind as PendingChoiceView['kind'])) return null;

  return {
    id: row.id,
    eventId: row.event_id,
    kind: row.kind as PendingChoiceView['kind'],
    payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>,
    expiresAt: toIsoOr(row.expires_at, DATE_FALLBACK),
  };
}

export function toMeView(
  seasonRows: PlayerRow[],
  viewer: { profileId: string; nickname: string; role: Role } | null,
): MeView | null {
  if (!viewer) return null;
  const inSeason = seasonRows.some((row) => row.profile_id === viewer.profileId);

  return {
    profileId: viewer.profileId,
    nickname: viewer.nickname,
    role: viewer.role,
    isPlayer: viewer.role !== 'spectator' && inSeason,
  };
}

export function toRatingsSeed(players: PlayerView[]): SeasonSnapshot['ratingsSeed'] {
  return players.map((player) => ({
    profileId: player.profileId,
    nickname: player.nickname,
    position: player.position,
    finishedAt: player.finishedAt,
    points: player.points,
    answered: player.answered,
    correct: player.correct,
  }));
}
