/**
 * Типы представления: ровно то, что нужно экранам.
 * Никаких строк БД наружу — сервер собирает snapshot один раз.
 */

import type { CellKind } from '@/lib/game/board';
import type { DiceTier } from '@/lib/game/dice';
import type { ActiveEffect } from '@/lib/game/engine';

export type Role = 'admin' | 'player' | 'spectator';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legend';
export type CardRoleGroup = 'GK' | 'DEF' | 'MID' | 'FWD';
export type LineupSlotKind = 'GK' | 'OF1' | 'OF2';
export type PackGrantSource = 'admin' | 'matchday' | 'cell';

export type QuestionOptionView = { key: string; label: string };

export type CardSetKind = 'national' | 'club';

export type FavoriteRef = {
  id: string;
  name: string;
};

export type PlayerView = {
  profileId: string;
  nickname: string;
  avatarUrl: string | null;
  role: Role;
  position: number;
  finishedAt: string | null;
  points: number;
  answered: number;
  correct: number;
  effects: ActiveEffect[];
  dice: Record<DiceTier, number>;
  /** Что игрок сделал последним — для мини-профиля. */
  lastAction: string | null;
  isMe: boolean;
  favoriteClub: FavoriteRef | null;
  favoriteNationalTeam: FavoriteRef | null;
  favoritePlayer: FavoriteRef | null;
};

export type MatchStatsView = {
  htHomeScore: number | null;
  htAwayScore: number | null;
  cornersHome: number | null;
  cornersAway: number | null;
  yellowCardsHome: number | null;
  yellowCardsAway: number | null;
  redCardsHome: number | null;
  redCardsAway: number | null;
  possessionHome: number | null;
  possessionAway: number | null;
  shotsOnTargetHome: number | null;
  shotsOnTargetAway: number | null;
};

export type MatchView = {
  id: string;
  leagueCode: string;
  leagueTitle: string;
  homeName: string;
  homeLogo: string | null;
  awayName: string;
  awayLogo: string | null;
  kickoffUtc: string;
  status: 'NS' | 'LIVE' | 'HT' | 'FT' | 'PST' | 'CANC' | 'ABD';
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  questionCount: number;
  myAnswered: number;
  inPredictions: boolean;
  stats: MatchStatsView;
};

export type QuestionView = {
  id: string;
  matchId: string;
  kind: 'choice' | 'yes_no' | 'exact_score';
  prompt: string;
  options: QuestionOptionView[];
  isBonus: boolean;
  locksAt: string;
  status: 'open' | 'locked' | 'resolved' | 'void';
  correctOption: string | null;
  myChoice: string | null;
  /** Сколько игроков выбрали каждый вариант — после лока. */
  distribution: Record<string, number> | null;
  /** Правило вопроса для live-индикации выполнения условия. */
  rule: unknown;
};

export type CellView = {
  idx: number;
  kind: CellKind;
  mechanicCode: string | null;
};

export type ActivityView = {
  id: string;
  kind: 'roll' | 'positive' | 'negative' | 'neutral' | 'system' | 'reward';
  message: string;
  createdAt: string;
};

export type MatchdayView = {
  id: string;
  gameDate: string;
  opensAt: string;
  closesAt: string;
  status: 'scheduled' | 'locked' | 'live' | 'resolving' | 'closed';
  qTotal: number | null;
};

export type ClosedMatchdayOption = Pick<MatchdayView, 'id' | 'gameDate' | 'status' | 'qTotal'> & {
  closesAt: string;
};

export type SeasonView = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'active' | 'finished';
  startsOn: string;
  endsOn: string;
};

export type MeView = {
  profileId: string;
  nickname: string;
  role: Role;
  /** Зритель тоже смотрит, но не играет. */
  isPlayer: boolean;
};

export type PendingChoiceView = {
  id: string;
  eventId: string;
  kind: 'var' | 'passage' | 'locker' | 'tactics' | 'pack_choice' | 'penalty' | 'dribble' | 'super_sub' | 'corner' | 'foul' | 'red_var' | 'attack_break';
  payload: Record<string, unknown>;
  expiresAt: string;
};

export type MatchdayResultView = {
  matchdayId: string;
  gameDate: string;
  profileId: string;
  nickname: string;
  answered: number;
  correct: number;
  total: number;
  bonusHit: boolean;
  dieTier: 'wood' | 'bronze' | 'silver' | 'gold' | null;
  rank?: number;
};

export type MyLastClosedDayResult = MatchdayResultView & {
  matchday: MatchdayView;
};

export type SeasonSnapshot = {
  season: SeasonView;
  players: PlayerView[];
  cells: CellView[];
  matchday: MatchdayView | null;
  matches: MatchView[];
  questions: QuestionView[];
  activity: ActivityView[];
  ratingsSeed: {
    profileId: string;
    nickname: string;
    position: number;
    finishedAt: string | null;
    points: number;
    answered: number;
    correct: number;
  }[];
  me: MeView | null;
  pending: PendingChoiceView | null;
  /** Итог последнего закрытого дня для текущего игрока (для сводки и отметки про кубик). */
  myLastClosedDayResult: MyLastClosedDayResult | null;
  /** Топ участников последнего закрытого дня (для контекста сводки). */
  lastClosedDayTop: MatchdayResultView[];
  /** Недавние закрытые дни (для просмотра результатов предиктов). */
  closedMatchdays: ClosedMatchdayOption[];
  serverNow: string;
  /** Демо-режим: БД не подключена, играем локально. */
  demo: boolean;
};

export type CardTemplateView = {
  id: string;
  playerName: string;
  /** Display team label (national team name or club name). */
  nationalTeam: string;
  nationalTeamSlug?: string | null;
  clubId?: string | null;
  clubName?: string | null;
  setId: string;
  setKind: CardSetKind;
  roleGroup: CardRoleGroup;
  rating: number;
  photoUrl: string | null;
  rarity: CardRarity;
};

export type OwnedCardView = CardTemplateView & {
  instanceId: string;
  obtainedAt: string;
};

export type PackGrantView = {
  id: string;
  packId: string;
  setId: string;
  setKind: CardSetKind;
  packTitle: string;
  source: PackGrantSource;
  createdAt: string;
};

export type PackOpenResultView = {
  grantId: string;
  /** Cards received in this opening (1–2 for A+; empty when none left). */
  cards: OwnedCardView[];
  /** Legacy convenience: first card or null. */
  card: OwnedCardView | null;
  collectionComplete?: boolean;
};

export type LineupSlotView = {
  matchId: string;
  slot: LineupSlotKind;
  card: OwnedCardView | null;
  bonusPoints?: number | null;
  bonusAwarded?: boolean;
  bonusMethod?: 'auto' | 'manual' | null;
};

export type MatchLineupView = {
  matchId: string;
  matchdayId?: string | null;
  leagueCode?: string | null;
  homeName: string;
  homeLogo?: string | null;
  awayName: string;
  awayLogo?: string | null;
  kickoffUtc: string;
  status: MatchView['status'];
  locked: boolean;
  slots: LineupSlotView[];
};
