/**
 * Типы представления: ровно то, что нужно экранам.
 * Никаких строк БД наружу — сервер собирает snapshot один раз.
 */

import type { CellKind } from '@/lib/game/board';
import type { DiceTier } from '@/lib/game/dice';
import type { ActiveEffect } from '@/lib/game/engine';

export type Role = 'admin' | 'player' | 'spectator';

export type QuestionOptionView = { key: string; label: string };

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
  kind: 'var' | 'passage' | 'locker' | 'tactics';
  payload: Record<string, unknown>;
  expiresAt: string;
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
  serverNow: string;
  /** Демо-режим: БД не подключена, играем локально. */
  demo: boolean;
};
