'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapScene } from '@/components/map/MapScene';
import { MapBoard, PlayerBadge, avatarColor, effectSummary } from '@/components/map/MapBoard';
import { usePanZoom } from '@/components/map/usePanZoom';
import { usePlayerWalk } from '@/components/map/usePlayerWalk';
import {
  applyLocker,
  applyPassage,
  applyTactics,
  applyVar,
  hasEffect,
  makePlayer,
  moveBy,
  NEGATIVE_EFFECTS,
  resolveCell,
  spendCharge,
  takeRollModifiers,
  type ActiveEffect,
  type CellChoice,
  type EffectCode,
  type PlayerState,
} from '@/lib/game/engine';
import { DICE_SIDES, rollValue, type DiceTier } from '@/lib/game/dice';
import { cellPoint } from '@/lib/game/map-layout';
import { stepSequence, walkDelay } from '@/lib/game/walk';
import { mechanic } from '@/lib/game/catalog';
import { formatAccuracy } from '@/lib/game/scoring';
import { isMuted, play, setMuted, startAmbient } from '@/lib/audio';
import type { ActivityView, PlayerView, SeasonSnapshot } from '@/lib/types';
import type { ActionResult } from '@/lib/actions/game';
import {
  chooseAttackBreakAction,
  chooseCornerAction,
  chooseDribbleAction,
  chooseFoulAction,
  chooseLastMinuteAction,
  chooseLockerAction,
  choosePackChoiceAction,
  choosePassageAction,
  choosePartnerInviteAction,
  choosePenaltyAction,
  chooseRedVarAction,
  respondPartnerInviteAction,
  resolveTrainingBaseAction,
  revealGuessClueAction,
  signCoachContractAction,
  submitFanSectorAction,
  submitGuessAnswerAction,
  submitPartnerChoiceAction,
  chooseSuperSubAction,
  chooseTacticsAction,
  chooseVarAction,
  submitRollAction,
} from '@/lib/actions/game';

const TIER_ORDER: DiceTier[] = ['gold', 'silver', 'bronze', 'wood'];

const TIER_LABEL: Record<DiceTier, string> = {
  gold: 'золотой',
  silver: 'серебряный',
  bronze: 'бронзовый',
  wood: 'деревянный',
};

type PendingBody =
  | { kind: 'tactics'; payload: { value: number; base: number; tier: DiceTier; from: number } }
  | { kind: 'var'; payload: Record<string, never> }
  | { kind: 'passage'; payload: Record<string, never> }
  | { kind: 'locker'; payload: Record<string, never> }
  | { kind: 'pack_choice'; payload: Record<string, never> }
  | { kind: 'penalty'; payload: Record<string, never> }
  | { kind: 'dribble'; payload: Record<string, never> }
  | { kind: 'super_sub'; payload: Record<string, never> }
  | { kind: 'corner'; payload: Record<string, never> }
  | { kind: 'foul'; payload: Record<string, never> }
  | { kind: 'red_var'; payload: Record<string, never> }
  | { kind: 'attack_break'; payload: Record<string, never> }
  | { kind: 'last_minute'; payload: { stage: 1 | 2; currentReward: 1 | 3 } }
  | { kind: 'rematch'; payload: Record<string, unknown> }
  | { kind: 'simulation'; payload: Record<string, unknown> }
  | { kind: 'gentleman'; payload: Record<string, unknown> }
  | { kind: 'training_base'; payload: Record<string, unknown> }
  | { kind: 'guess_player'; payload: Record<string, unknown> }
  | { kind: 'fan_sector'; payload: Record<string, unknown> }
  | { kind: 'coach_contract'; payload: Record<string, unknown> };

/** Ожидание решения: `id` есть только у записи из БД, в демо его нет. */
type Pending = PendingBody & { id?: string };

function isDiceTier(value: unknown): value is DiceTier {
  return value === 'gold' || value === 'silver' || value === 'bronze' || value === 'wood';
}

/**
 * Восстанавливает незакрытое событие из снимка: перезагрузка в середине VAR
 * или Тактики не должна давать новый бросок (docs/07).
 */
function seedPending(view: SeasonSnapshot['pending']): Pending | null {
  if (!view) return null;

  if (view.kind === 'tactics') {
    const payload = view.payload;
    const value = payload.value;
    const base = payload.base;
    const from = payload.from;
    if (typeof value !== 'number' || typeof base !== 'number' || !isDiceTier(payload.tier)) return null;

    return {
      id: view.id,
      kind: 'tactics',
      payload: { value, base, tier: payload.tier, from: typeof from === 'number' ? from : 0 },
    };
  }

  if (view.kind === 'last_minute') {
    const stage = view.payload.stage;
    const currentReward = view.payload.currentReward;
    if ((stage === 1 || stage === 2) && (currentReward === 1 || currentReward === 3)) {
      return { id: view.id, kind: 'last_minute', payload: { stage, currentReward } };
    }
    return null;
  }

  if (
    view.kind === 'rematch' || view.kind === 'simulation' || view.kind === 'gentleman' ||
    view.kind === 'training_base' || view.kind === 'guess_player' || view.kind === 'fan_sector' || view.kind === 'coach_contract'
  ) {
    return { id: view.id, kind: view.kind, payload: (view.payload && typeof view.payload === 'object' ? view.payload : {}) as Record<string, unknown> };
  }

  return { id: view.id, kind: view.kind, payload: {} };
}

/** Ключ идемпотентности: один и тот же на повторный клик, новый — на следующий бросок. */
function newRollKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type LastRoll = {
  base: number;
  value: number;
  tier: DiceTier;
  from: number;
  to: number;
  eventText: string | null;
  awaiting: PendingBody['kind'] | null;
};

/** Грань на кубике во время броска: крутится, потом замирает на результате. */
type Tumble = { tier: DiceTier; face: number; settled: boolean };

/** Как часто меняется грань при прокрутке. */
const TUMBLE_TICK_MS = 70;
/** Сколько крутится кубик перед показом результата (демо). */
const TUMBLE_ROLL_MS = 1500;
/** Сколько держится финальная грань перед возвратом к обычному виду. */
const TUMBLE_SETTLE_MS = 1400;

function pluralDice(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'кубик';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'кубика';
  return 'кубиков';
}

function firstAvailableTier(dice: Record<DiceTier, number>): DiceTier | null {
  return TIER_ORDER.find((tier) => dice[tier] > 0) ?? null;
}

function totalDice(dice: Record<DiceTier, number>): number {
  return TIER_ORDER.reduce((sum, tier) => sum + dice[tier], 0);
}

function eventKind(code: string | null): ActivityView['kind'] {
  const polarity = mechanic(code)?.polarity;
  if (polarity === 'positive') return 'positive';
  if (polarity === 'negative' || polarity === 'trap') return 'negative';
  if (code) return 'neutral';
  return 'system';
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
}

export function GameHud({ snapshot }: { snapshot: SeasonSnapshot }) {
  const router = useRouter();
  const meSeed = snapshot.players.find((p) => p.isMe) ?? null;

  const [players, setPlayers] = useState<PlayerView[]>(snapshot.players);
  const [dice, setDice] = useState<Record<DiceTier, number>>(
    meSeed?.dice ?? { wood: 0, bronze: 0, silver: 0, gold: 0 },
  );
  const [selectedTier, setSelectedTier] = useState<DiceTier | null>(() =>
    meSeed ? firstAvailableTier(meSeed.dice) : null,
  );
  const [pending, setPending] = useState<Pending | null>(() => seedPending(snapshot.pending));
  const [busy, setBusy] = useState(false);
  const [tumble, setTumble] = useState<Tumble | null>(null);
  const tumbleTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const rollKeyRef = useRef<string>(newRollKey());
  const [feed, setFeed] = useState<ActivityView[]>(snapshot.activity);
  const [toast, setToast] = useState<{ text: string; kind: 'error' | 'info' } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerView | null>(null);
  const [lastRoll, setLastRoll] = useState<LastRoll | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const feedLengthRef = useRef(snapshot.activity.length);
  const [liveMuted, setLiveMuted] = useState(false);
  const [showMapOverlay, setShowMapOverlay] = useState(true);

  useEffect(() => {
    const added = feed.length - feedLengthRef.current;
    feedLengthRef.current = feed.length;
    if (added > 0 && !feedOpen) setUnread((value) => value + added);
  }, [feed, feedOpen]);

  useEffect(() => {
    if (feedOpen) setUnread(0);
  }, [feedOpen]);

  const handleWalkStep = useCallback(() => {
    play('step');
  }, []);
  const { displayed, walking } = usePlayerWalk(players, { onStep: handleWalkStep });

  const clearTumbleTimers = useCallback(() => {
    if (tumbleTimer.current !== null) {
      window.clearInterval(tumbleTimer.current);
      tumbleTimer.current = null;
    }
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const startTumble = useCallback(
    (tier: DiceTier) => {
      clearTumbleTimers();
      const sides = DICE_SIDES[tier];
      const nextFace = () => 1 + Math.floor(Math.random() * sides);
      setTumble({ tier, face: nextFace(), settled: false });
      tumbleTimer.current = window.setInterval(() => {
        setTumble({ tier, face: nextFace(), settled: false });
      }, TUMBLE_TICK_MS);
    },
    [clearTumbleTimers],
  );

  const settleTumble = useCallback((face?: number) => {
    if (tumbleTimer.current !== null) {
      window.clearInterval(tumbleTimer.current);
      tumbleTimer.current = null;
    }
    setTumble((current) => (current ? { ...current, face: face ?? current.face, settled: true } : current));
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setTumble(null), TUMBLE_SETTLE_MS);
  }, []);

  useEffect(() => () => clearTumbleTimers(), [clearTumbleTimers]);

  const me = players.find((p) => p.isMe) ?? null;
  /** Кубики и предикты — только участнику сезона; зритель и гость смотрят. */
  const canPlay = snapshot.me?.isPlayer === true;
  const isWalking = Boolean(me && walking[me.profileId]);
  const selectedDisplayed = selectedPlayer
    ? displayed.find((player) => player.profileId === selectedPlayer.profileId) ?? selectedPlayer
    : null;
  const myFocus = me ? cellPoint(me.position) : undefined;

  const panZoom = usePanZoom({
    focus: myFocus ? { x: myFocus.x * 4096, y: myFocus.y * 2048 } : undefined,
  });

  useEffect(() => {
    setLiveMuted(isMuted());
  }, []);

  // В режиме БД свежий снимок приходит после `router.refresh()`:
  // переносим позиции и кубики, иначе карта останется на старом ходе.
  useEffect(() => {
    if (snapshot.demo) return;
    setPlayers(snapshot.players);
    const mine = snapshot.players.find((player) => player.isMe);
    setDice(mine?.dice ?? { wood: 0, bronze: 0, silver: 0, gold: 0 });
    setPending(seedPending(snapshot.pending));
    setFeed(snapshot.activity);
  }, [snapshot]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pushFeed = useCallback((message: string, kind: ActivityView['kind']) => {
    setFeed((prev) => [
      {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        message,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }, []);

  const syncMe = useCallback((next: PlayerState, finishedAt?: string | null) => {
    setPlayers((prev) =>
      prev.map((player) =>
        player.isMe
          ? {
              ...player,
              position: next.position,
              effects: next.effects,
              finishedAt: next.finished ? player.finishedAt ?? finishedAt ?? new Date().toISOString() : null,
            }
          : player,
      ),
    );
  }, []);

  const finishMove = useCallback(
    (state: PlayerState, value: number, tier: DiceTier, base: number, modsNote: string | null = null) => {
      if (!me) return;
      const from = state.position;
      const landed = moveBy(state, value);
      const cell = snapshot.cells[landed.position - 1];
      const outcome = resolveCell(landed, cell?.mechanicCode ?? null, me.nickname);
      const final = outcome.state;

      syncMe(final);

      const landedOn = landed.position;
      const rollText =
        value !== base
          ? `на кубике выпало ${base}${modsNote ? `, ${modsNote}` : ''} — идёшь на ${value}`
          : `на кубике выпало ${value}`;
      const eventText = cell?.mechanicCode ? outcome.log : 'Обычная клетка — ничего не происходит.';
      const choiceText = outcome.awaiting ? ' Нужно выбрать, что делать дальше.' : '';

      pushFeed(
        `${me.nickname}: ${TIER_LABEL[tier]} кубик (d${DICE_SIDES[tier]}) — ${rollText}. Клетка ${from} → ${landedOn}.${choiceText}`,
        'roll',
      );
      if (landedOn !== final.position) {
        pushFeed(
          `${me.nickname}: эффект клетки сдвинул на ${landedOn} → ${final.position}. ${eventText}`,
          eventKind(cell?.mechanicCode ?? null),
        );
      } else {
        pushFeed(`${me.nickname}: ${eventText}${choiceText}`, eventKind(cell?.mechanicCode ?? null));
      }

      const polarity = mechanic(cell?.mechanicCode ?? null)?.polarity;
      const landSound: Parameters<typeof play>[0] =
        polarity === 'positive' ? 'positive' : polarity === 'negative' || polarity === 'trap' ? 'negative' : 'land';
      const steps = stepSequence(from, final.position);
      const landingDelay = walkDelay(steps.length);

      const pendingFromOutcome = (awaiting: NonNullable<typeof outcome.awaiting>): Pending => {
        if (awaiting === 'last_minute') return { kind: 'last_minute', payload: { stage: 1, currentReward: 1 } };
        return { kind: awaiting, payload: {} } as Pending;
      };

      if (landingDelay === 0) {
        play(landSound);
        if (outcome.awaiting) setPending(pendingFromOutcome(outcome.awaiting));
      } else {
        window.setTimeout(() => play(landSound), landingDelay);
        if (outcome.awaiting) {
          const awaiting = outcome.awaiting;
          window.setTimeout(() => setPending(pendingFromOutcome(awaiting)), landingDelay);
        }
      }

      setLastRoll({
        base,
        value,
        tier,
        from,
        to: final.position,
        eventText: modsNote && value !== base ? `${eventText} (на бросок повлияло: ${modsNote})` : eventText,
        awaiting: outcome.awaiting ?? null,
      });
      settleTumble(base);
      setBusy(false);
    },
    [me, pushFeed, settleTumble, snapshot.cells, syncMe],
  );

  const demoRoll = useCallback(
    (tier: DiceTier) => {
      if (!me) return;
      const state = makePlayer(me.position, me.effects);
      const { state: afterMods, mods } = takeRollModifiers(state);
      const base = rollValue(tier, Math.random);
      const value = Math.max(1, base + (mods.tribuny ? 1 : 0) - (mods.gazon ? 1 : 0));
      const modsNote =
        mods.tribuny && mods.gazon
          ? '«Домашние трибуны» (+1) и «Скользкий газон» (−1)'
          : mods.tribuny
            ? '«Домашние трибуны» (+1)'
            : mods.gazon
              ? '«Скользкий газон» (−1)'
              : null;

      setDice((prev) => ({ ...prev, [tier]: Math.max(0, prev[tier] - 1) }));

      if (hasEffect(afterMods, 'tactics')) {
        syncMe(afterMods);
        setLastRoll({
          base,
          value,
          tier,
          from: me.position,
          to: me.position,
          eventText: `Тактическая схема: можно изменить ход на ±1.${modsNote ? ` На бросок уже повлияло: ${modsNote}.` : ''}`,
          awaiting: 'tactics',
        });
        const rollText = value !== base ? `на кубике ${base}, ${modsNote} — сейчас ${value}` : `на кубике ${value}`;
        pushFeed(
          `${me.nickname}: ${TIER_LABEL[tier]} кубик (d${DICE_SIDES[tier]}) — ${rollText}. «Тактическая схема»: выбирает, оставить как есть или ±1.`,
          'roll',
        );
        setPending({ kind: 'tactics', payload: { value, base, tier, from: me.position } });
        play('neutral');
        settleTumble(base);
        setBusy(false);
        return;
      }

      finishMove(afterMods, value, tier, base, modsNote);
    },
    [finishMove, me, pushFeed, settleTumble, syncMe],
  );

  const handleRoll = useCallback(async () => {
    if (!canPlay || !me || busy) return;
    if (pending) {
      setToast({ text: 'Сначала разберись с событием, потом бросай', kind: 'error' });
      return;
    }
    if (me.position >= 80) {
      setToast({ text: 'Ты уже на финише. Осталось дождаться остальных', kind: 'info' });
      return;
    }

    const tier = selectedTier && dice[selectedTier] > 0 ? selectedTier : firstAvailableTier(dice);
    if (!tier) {
      setToast({ text: 'Кубиков нет. Сделай предикты — и будут', kind: 'error' });
      return;
    }

    startAmbient();
    play('roll');
    setBusy(true);
    startTumble(tier);

    if (!snapshot.demo) {
      const result = await submitRollAction({
        matchdayId: snapshot.matchday?.id ?? '',
        tier,
        idempotencyKey: rollKeyRef.current,
      });
      if (!result.ok) {
        settleTumble();
        setBusy(false);
        setToast({ text: result.message, kind: 'error' });
        return;
      }
      rollKeyRef.current = newRollKey();
      setDice((prev) => ({ ...prev, [tier]: Math.max(0, prev[tier] - 1) }));

      // Показываем выпавшее число перед обновлением данных с сервера.
      if (result.roll) {
        settleTumble(result.roll.base);
        setLastRoll({
          base: result.roll.base,
          value: result.roll.value,
          tier: result.roll.tier,
          from: result.roll.from,
          to: result.roll.from,
          eventText: result.roll.needsTactics
            ? 'Тактическая схема: выбери, оставить бросок или изменить его на ±1.'
            : 'Бросок принят. Обновляем ход...',
          awaiting: result.roll.needsTactics ? 'tactics' : null,
        });
        clearTumbleTimers();
        setTumble({ tier: result.roll.tier, face: result.roll.base, settled: true });
        window.setTimeout(() => {
          setTumble(null);
          setBusy(false);
          router.refresh();
        }, 1400);
        return;
      }

      clearTumbleTimers();
      setTumble(null);
      router.refresh();
      setBusy(false);
      return;
    }

    window.setTimeout(() => demoRoll(tier), TUMBLE_ROLL_MS);
  }, [busy, canPlay, demoRoll, dice, me, pending, router, selectedTier, settleTumble, snapshot.demo, snapshot.matchday?.id, startTumble]);

  const runServerChoice = useCallback(
    async (run: () => Promise<ActionResult>, sound: Parameters<typeof play>[0]) => {
      setBusy(true);
      const result = await run();
      setBusy(false);

      if (!result.ok) {
        setToast({ text: result.message, kind: 'error' });
        return;
      }

      setPending(null);
      play(sound);
      router.refresh();
    },
    [router],
  );

  const chooseTactics = useCallback(
    (delta: number) => {
      if (pending?.kind !== 'tactics' || !me) return;
      const pendingId = pending.id;

      if (!snapshot.demo) {
        if (!pendingId) return;
        void runServerChoice(() => chooseTacticsAction({ pendingId, delta }), 'click');
        return;
      }

      const { value, base, tier, from } = pending.payload;
      const state = spendCharge(makePlayer(me.position, me.effects), 'tactics');
      const adjusted = applyTactics(value, delta);
      pushFeed(
        delta === 0
          ? '«Тактическая схема»: оставили число как есть.'
          : `«Тактическая схема»: ${delta > 0 ? 'добавили' : 'убрали'} 1 к ходу.`,
        'neutral',
      );
      setPending(null);
      setBusy(false);
      finishMove(state, adjusted, tier, base, delta === 0 ? '«Тактическая схема» (без изменений)' : `«Тактическая схема» (${delta > 0 ? '+1' : '−1'})`);
      play('click');
    },
    [finishMove, me, pending, pushFeed, runServerChoice, snapshot.demo],
  );

  const chooseVar = useCallback(
    (contest: boolean) => {
      if (!me) return;
      const pendingId = pending?.kind === 'var' ? pending.id : undefined;

      if (!snapshot.demo) {
        if (!pendingId) return;
        void runServerChoice(() => chooseVarAction({ pendingId, contest }), 'var');
        return;
      }

      const state = makePlayer(me.position, me.effects);
      const outcome = applyVar(state, contest);
      syncMe(outcome.state);
      pushFeed(outcome.log, contest ? 'neutral' : 'negative');
      setLastRoll((prev) =>
        prev ? { ...prev, to: outcome.state.position, eventText: outcome.log, awaiting: null } : prev,
      );
      setPending(null);
      play('var');
    },
    [me, pending, pushFeed, runServerChoice, snapshot.demo, syncMe],
  );

  const choosePassage = useCallback(
    (targetId: string | null) => {
      if (!me) return;
      const pendingId = pending?.kind === 'passage' ? pending.id : undefined;

      if (!snapshot.demo) {
        if (!pendingId) return;
        void runServerChoice(() => choosePassageAction({ pendingId, targetId }), targetId ? 'positive' : 'click');
        return;
      }

      if (!targetId) {
        pushFeed(`${me.nickname} решает остаться на месте.`, 'system');
        setPending(null);
        play('click');
        return;
      }
      const target = players.find((p) => p.profileId === targetId);
      if (!target) return;
      const giverState = makePlayer(me.position, me.effects);
      const receiverState = makePlayer(target.position, target.effects);
      const result = applyPassage(giverState, receiverState, true);
      setPlayers((prev) =>
        prev.map((player) => {
          if (player.profileId === targetId) {
            return {
              ...player,
              position: result.receiver.position,
              effects: result.receiver.effects,
              finishedAt: result.receiver.finished ? player.finishedAt ?? new Date().toISOString() : player.finishedAt,
            };
          }
          return player;
        }),
      );
      pushFeed(`Голевая передача: ${target.nickname} делает шаг вперёд.`, 'positive');
      setPending(null);
      play('positive');
    },
    [me, pending, players, pushFeed, runServerChoice, snapshot.demo],
  );

  const chooseLocker = useCallback(
    (remove: EffectCode | 'advance') => {
      if (!me) return;
      const pendingId = pending?.kind === 'locker' ? pending.id : undefined;

      if (!snapshot.demo) {
        if (!pendingId) return;
        void runServerChoice(
          () => chooseLockerAction({ pendingId, remove }),
          remove === 'advance' ? 'neutral' : 'reward',
        );
        return;
      }

      const state = makePlayer(me.position, me.effects);
      const outcome = applyLocker(state, remove);
      syncMe(outcome.state);
      pushFeed(outcome.log, remove === 'advance' ? 'neutral' : 'positive');
      setLastRoll((prev) =>
        prev ? { ...prev, to: outcome.state.position, eventText: outcome.log, awaiting: null } : prev,
      );
      setPending(null);
      play('reward');
    },
    [me, pending, pushFeed, runServerChoice, snapshot.demo, syncMe],
  );

  const choosePackChoice = useCallback(
    (packKind: 'national' | 'club') => {
      if (!me) return;
      const pendingId = pending?.kind === 'pack_choice' ? pending.id : undefined;
      if (!snapshot.demo) {
        if (!pendingId) return;
        void runServerChoice(() => choosePackChoiceAction({ pendingId, packKind }), 'reward');
        return;
      }
      pushFeed(packKind === 'club' ? 'Выбран клубный пак.' : 'Выбран пак сборных.', 'positive');
      setLastRoll((prev) => (prev ? { ...prev, eventText: 'Пак выбран.', awaiting: null } : prev));
      setPending(null);
      play('reward');
      router.refresh();
    },
    [me, pending, pushFeed, router, runServerChoice, snapshot.demo],
  );

  const choosePenalty = useCallback((choice: 'shoot' | 'pass') => {
    const pendingId = pending?.kind === 'penalty' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => choosePenaltyAction({ pendingId, choice }), 'click'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);
  const chooseDribble = useCallback((choice: 'beat' | 'pass') => {
    const pendingId = pending?.kind === 'dribble' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => chooseDribbleAction({ pendingId, choice }), 'click'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);
  const chooseSuperSub = useCallback((choice: 'buff' | 'shield') => {
    const pendingId = pending?.kind === 'super_sub' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => chooseSuperSubAction({ pendingId, choice }), 'reward'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);
  const chooseCorner = useCallback((choice: 'simple' | 'risky') => {
    const pendingId = pending?.kind === 'corner' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => chooseCornerAction({ pendingId, choice }), 'click'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);
  const chooseFoul = useCallback((choice: 'defend' | 'dispute') => {
    const pendingId = pending?.kind === 'foul' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => chooseFoulAction({ pendingId, choice }), 'click'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);
  const chooseRedVar = useCallback((targetProfileId: string) => {
    const pendingId = pending?.kind === 'red_var' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => chooseRedVarAction({ pendingId, targetProfileId }), 'var'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);
  const chooseAttackBreak = useCallback((targetProfileId: string | null) => {
    const pendingId = pending?.kind === 'attack_break' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => chooseAttackBreakAction({ pendingId, targetProfileId }), 'negative'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const chooseLastMinute = useCallback((choice: 'stop' | 'continue') => {
    const pendingId = pending?.kind === 'last_minute' ? pending.id : undefined;
    if (!snapshot.demo) {
      if (!pendingId) return;
      void runServerChoice(() => chooseLastMinuteAction({ pendingId, choice }), choice === 'continue' ? 'click' : 'reward');
      return;
    }
    setPending(null);
    router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const choosePartnerInvite = useCallback((targetProfileId: string | null) => {
    const p = pending;
    const pendingId = p && (p.kind === 'rematch' || p.kind === 'simulation' || p.kind === 'gentleman') ? p.id : undefined;
    if (!snapshot.demo) {
      if (!pendingId) return;
      void runServerChoice(() => choosePartnerInviteAction({ pendingId, targetProfileId }), targetProfileId ? 'click' : 'land');
      return;
    }
    setPending(null);
    router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const respondPartnerInvite = useCallback((accept: boolean) => {
    const p = pending;
    const pendingId = p && (p.kind === 'rematch' || p.kind === 'simulation' || p.kind === 'gentleman') ? p.id : undefined;
    if (!snapshot.demo) {
      if (!pendingId) return;
      void runServerChoice(() => respondPartnerInviteAction({ pendingId, accept }), accept ? 'positive' : 'land');
      return;
    }
    setPending(null);
    router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const submitPartnerChoice = useCallback((choice: string) => {
    const p = pending;
    const pendingId = p && (p.kind === 'rematch' || p.kind === 'simulation' || p.kind === 'gentleman') ? p.id : undefined;
    if (!snapshot.demo) {
      if (!pendingId) return;
      void runServerChoice(() => submitPartnerChoiceAction({ pendingId, choice }), 'click');
      return;
    }
    setPending(null);
    router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const doTrainingShot = useCallback(() => {
    const pendingId = pending?.kind === 'training_base' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => resolveTrainingBaseAction({ pendingId }), 'click'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const doRevealGuessClue = useCallback(() => {
    const pendingId = pending?.kind === 'guess_player' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => revealGuessClueAction({ pendingId }), 'click'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const doSubmitGuessAnswer = useCallback((answer: string) => {
    const pendingId = pending?.kind === 'guess_player' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => submitGuessAnswerAction({ pendingId, answer }), 'click'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const doFanSector = useCallback((submit: boolean) => {
    const pendingId = pending?.kind === 'fan_sector' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => submitFanSectorAction({ pendingId, submit }), submit ? 'positive' : 'land'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const doCoachContract = useCallback((sign: boolean) => {
    const pendingId = pending?.kind === 'coach_contract' ? pending.id : undefined;
    if (!snapshot.demo) { if (!pendingId) return; void runServerChoice(() => signCoachContractAction({ pendingId, sign }), sign ? 'positive' : 'land'); return; }
    setPending(null); router.refresh();
  }, [pending, router, runServerChoice, snapshot.demo]);

  const toggleMute = () => {
    const next = !liveMuted;
    setLiveMuted(next);
    setMuted(next);
    if (!next) startAmbient();
  };

  const total = totalDice(dice);

  const isWaiting = Boolean(pending && (pending.payload as Record<string, unknown>).waiting === true);
  const rollDisabled =
    !canPlay || !me || busy || isWalking || (Boolean(pending) && !isWaiting) || total === 0 || me.position >= 80;
  const rollHelper = !canPlay
    ? 'Сейчас бросают кубики только участники'
    : !me
      ? 'Ты смотришь как зритель'
      : isWalking
        ? 'Фишка идёт по клеткам'
        : pending && !isWaiting
          ? 'Сначала выбери, что делать'
          : pending && isWaiting
            ? 'Ждём ответа партнёра'
            : me.position >= 80
            ? 'Ты уже на финише'
            : total === 0
              ? 'Кубиков нет — ответь на вопросы, чтобы получить'
              : `${total} ${pluralDice(total)} в запасе`;

  return (
    <>
      <div className="map-stage">
        <div
          ref={panZoom.viewportRef}
          className="map-viewport"
          tabIndex={0}
          aria-label="Карта сезона. Перетаскивай мышью, зум колёсиком"
          onClickCapture={(event) => {
            if (panZoom.wasDrag()) {
              event.stopPropagation();
              event.preventDefault();
            }
          }}
        >
          <div ref={panZoom.canvasRef} className="map-canvas" style={{ visibility: 'hidden' }}>
            <MapScene />
            <MapBoard
              cells={snapshot.cells}
              players={displayed}
              selectedPlayerId={selectedPlayer?.profileId ?? null}
              inverseScale={1 / Math.max(0.0001, panZoom.scale)}
              showOverlay={showMapOverlay}
              onSelectPlayer={(player) => {
                setSelectedPlayer(player);
                play('click');
              }}
            />
          </div>
        </div>

        <div className="map-controls" data-shifted={!canPlay ? (snapshot.demo ? 'stacked' : 'true') : 'false'}>
          <button type="button" className="icon-btn" onClick={() => panZoom.zoomBy(1.18)} aria-label="Приблизить карту">
            +
          </button>
          <button type="button" className="icon-btn" onClick={() => panZoom.zoomBy(0.85)} aria-label="Отдалить карту">
            −
          </button>
          <button type="button" className="icon-btn" onClick={() => panZoom.reset()} aria-label="Вернуться к своей клетке">
            ⌂
          </button>
        </div>

        <div className="map-view-controls" aria-label="Управление видом и звуком">
          <button
            type="button"
            className="icon-btn"
            data-on={!liveMuted}
            onClick={toggleMute}
            aria-label={liveMuted ? 'Включить звук' : 'Выключить звук'}
            title={liveMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {liveMuted ? '🔇' : '🔊'}
          </button>
          <button
            type="button"
            className="icon-btn"
            data-on={showMapOverlay}
            onClick={() => {
              setShowMapOverlay((v) => !v);
              play('click');
            }}
            aria-pressed={showMapOverlay}
            aria-label={showMapOverlay ? 'Скрыть клетки, линии и участников' : 'Показать клетки, линии и участников'}
            title={showMapOverlay ? 'Скрыть клетки, линии и участников' : 'Показать клетки, линии и участников'}
          >
            📍
          </button>
        </div>

        <div className="map-hint">
          <span>Перетаскивай карту</span>
          <span>•</span>
          <span>Колёсико — зум</span>
          <span>•</span>
          <span>Клик по персонажу — профиль</span>
        </div>
      </div>

      {snapshot.demo && (
        <div className="demo-banner">
          <span>Демо-режим</span>
          <span>·</span>
          <span>подключи Supabase, чтобы играть с друзьями</span>
        </div>
      )}

      {!canPlay && (
        <div className={`role-banner${snapshot.demo ? ' role-banner--stacked' : ''}`}>
          {snapshot.me ? (
            <span>Ты зритель: смотри и болей, кубики и предикты недоступны</span>
          ) : (
            <>
              <span>Ты гость: войди, чтобы играть</span>
              <Link href="/login" className="role-banner__link">
                Войти
              </Link>
            </>
          )}
        </div>
      )}

      <div className="feed" aria-live="polite">
        <button type="button" className="feed__toggle" onClick={() => setFeedOpen((v) => !v)} aria-expanded={feedOpen}>
          <span>Комментатор</span>
          {!feedOpen && unread > 0 && (
            <span className="feed__badge" aria-label={`${unread} новых записей`}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          <span style={{ marginLeft: 'auto', color: 'var(--lime)' }}>{feedOpen ? '−' : '+'}</span>
        </button>
        {feedOpen && (
          <div className="feed__list">
            {feed.slice(0, 30).map((item, index) => (
              <div
                key={item.id}
                className="feed__item feed__item--enter"
                data-kind={item.kind}
                style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
              >
                <span className="feed__time">{timeLabel(item.createdAt)}</span>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dice-tray" data-disabled={!canPlay}>
        <div className="dice-bank" role="group" aria-label="Твои кубики">
          {TIER_ORDER.map((tier) => (
            <button
              key={tier}
              type="button"
              className="dice-chip"
              data-selected={selectedTier === tier}
              disabled={!canPlay || dice[tier] === 0}
              onClick={() => {
                setSelectedTier(tier);
                play('click');
              }}
              aria-label={`${TIER_LABEL[tier]} кубик, осталось ${dice[tier]}`}
            >
              <span
                className={`die die--${tier}${
                  tumble?.tier === tier ? (tumble.settled ? ' die--settle' : ' die--tumbling') : ''
                }`}
              >
                {tumble?.tier === tier ? tumble.face : `d${DICE_SIDES[tier]}`}
              </span>
              ×{dice[tier]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="dice-roll-btn"
          data-busy={busy}
          data-tumbling={Boolean(tumble && !tumble.settled)}
          disabled={rollDisabled}
          onClick={handleRoll}
        >
          <span
            className={`die die--${tumble?.tier ?? selectedTier ?? 'gold'}${
              tumble ? (tumble.settled ? ' die--settle' : ' die--tumbling') : ''
            }`}
          >
            {tumble ? tumble.face : busy ? '…' : '★'}
          </span>
          {busy ? 'Бросаем' : 'Бросить кубик'}
        </button>
        <div className="dice-helper">{rollHelper}</div>
        {lastRoll && (
          <div className="dice-summary" aria-live="polite">
            <div className="dice-summary__line">
              <strong>Кубик:</strong> {TIER_LABEL[lastRoll.tier]} (d{DICE_SIDES[lastRoll.tier]})
            </div>
            <div className="dice-summary__line">
              <strong>На кубике:</strong> {lastRoll.base}
              {lastRoll.value !== lastRoll.base
                ? `, но по итогу идёшь на ${lastRoll.value} ${pluralCells(lastRoll.value)}`
                : ` — идёшь на ${lastRoll.value} ${pluralCells(lastRoll.value)}`}
            </div>
            <div className="dice-summary__line">
              <strong>Ход:</strong> с клетки {lastRoll.from} на клетку {lastRoll.to}
            </div>
            {lastRoll.eventText && (
              <div className="dice-summary__line">
                <strong>Что произошло:</strong> {lastRoll.eventText}
              </div>
            )}
            {lastRoll.awaiting && (
              <div className="dice-summary__line dice-summary__line--active">
                <strong>Сейчас:</strong> {me?.nickname ?? 'Игрок'} выбирает, что делать
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="toast" data-kind={toast.kind} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}

      {selectedDisplayed && (
        <PlayerPopover player={selectedDisplayed} onClose={() => setSelectedPlayer(null)} />
      )}

      {tumble && (
        <div className="dice-roll-overlay" role="dialog" aria-modal="true" aria-label="Бросок кубика">
          <div className="dice-roll-overlay__backdrop" />
          <div className="dice-roll-overlay__content">
            <div className={`dice-roll-cube die--${tumble.tier} ${tumble.settled ? 'dice-roll-cube--settle' : 'dice-roll-cube--tumbling'}`}>
              <div className="dice-roll-cube__scene">
                <div className="dice-roll-cube__cube">
                  <div className="dice-roll-cube__face dice-roll-cube__face--front">{tumble.face}</div>
                  <div className="dice-roll-cube__face dice-roll-cube__face--back">{Math.max(1, tumble.face - 1)}</div>
                  <div className="dice-roll-cube__face dice-roll-cube__face--right">{Math.min(DICE_SIDES[tumble.tier], tumble.face + 1)}</div>
                  <div className="dice-roll-cube__face dice-roll-cube__face--left">{Math.max(1, tumble.face % DICE_SIDES[tumble.tier] + 1)}</div>
                  <div className="dice-roll-cube__face dice-roll-cube__face--top">{DICE_SIDES[tumble.tier]}</div>
                  <div className="dice-roll-cube__face dice-roll-cube__face--bottom">1</div>
                </div>
              </div>
            </div>
            <div className="dice-roll-overlay__label">
              {tumble.settled ? `Выпало: ${tumble.face}` : 'Кубик крутится...'}
            </div>
            <div className="dice-roll-overlay__tier">
              {TIER_LABEL[tumble.tier]} кубик (d{DICE_SIDES[tumble.tier]})
            </div>
          </div>
        </div>
      )}

      {pending && me && !isWaiting && (
        <EventModal
          pending={pending}
          me={me}
          players={players}
          onTactics={chooseTactics}
          onVar={chooseVar}
          onPassage={choosePassage}
          onLocker={chooseLocker}
          onPackChoice={choosePackChoice}
          onPenalty={choosePenalty}
          onDribble={chooseDribble}
          onSuperSub={chooseSuperSub}
          onCorner={chooseCorner}
          onFoul={chooseFoul}
          onRedVar={chooseRedVar}
          onAttackBreak={chooseAttackBreak}
          onLastMinute={chooseLastMinute}
          onPartnerInvite={choosePartnerInvite}
          onPartnerRespond={respondPartnerInvite}
          onPartnerChoice={submitPartnerChoice}
          onTrainingShot={doTrainingShot}
          onRevealGuessClue={doRevealGuessClue}
          onSubmitGuessAnswer={doSubmitGuessAnswer}
          onFanSector={doFanSector}
          onCoachContract={doCoachContract}
          onCancel={() => {
            if (!snapshot.demo) {
              setToast({ text: 'Событие нужно решить: оно держит следующий бросок', kind: 'info' });
              return;
            }
            setPending(null);
          }}
        />
      )}
      {pending && me && isWaiting && (
        <div className="toast toast--info" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60 }}>
          Ожидаем ответ партнёра по событию. Можно бросать кубик дальше.
        </div>
      )}
    </>
  );
}

function pluralCells(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'клетку';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'клетки';
  return 'клеток';
}

function PlayerPopover({ player, onClose }: { player: PlayerView; onClose: () => void }) {
  const effects = effectSummary(player);
  const totalDice = player.dice.gold + player.dice.silver + player.dice.bronze + player.dice.wood;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Профиль ${player.nickname}`} onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} style={{ width: 'min(460px, 100%)' }}>
        <div className="modal__eyebrow">
          <span>Мини-профиль</span>
          <span>{player.role === 'admin' ? 'админ' : player.role === 'spectator' ? 'зритель' : 'игрок'}</span>
          {player.isMe && <span className="chip chip--positive">это вы</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span
            className="avatar"
            style={{
              width: 56,
              height: 56,
              fontSize: 20,
              overflow: 'hidden',
              background: `linear-gradient(150deg, ${avatarColor(player.nickname, 0)}, ${avatarColor(player.nickname, 1)})`,
            }}
          >
            {player.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              player.nickname.slice(0, 1).toUpperCase()
            )}
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 className="modal__title" style={{ margin: 0 }}>
              {player.nickname}
            </h2>
            <div className="card__meta">Клетка {player.position} из 80 · очков {player.points}</div>
          </div>
        </div>

        <div className="stats" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="stat__label">Очки</div>
            <div className="stat__value stat__value--lime">{player.points}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Точность</div>
            <div className="stat__value" style={{ fontSize: 20 }}>{formatAccuracy(player.answered ? player.correct / player.answered : null)}</div>
            <div className="card__meta">{player.correct}/{player.answered}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Кубики</div>
            <div className="stat__value">{totalDice}</div>
            <div className="card__meta">d6×{player.dice.gold} d4×{player.dice.silver} d3×{player.dice.bronze} d2×{player.dice.wood}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div>
            <div className="card__meta" style={{ marginBottom: 6 }}>Эффекты</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {effects.length === 0 ? <span className="chip chip--muted">нет</span> : effects.map((effect) => (
                <span key={effect} className="chip chip--info">{effect}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="card__meta" style={{ marginBottom: 4 }}>Любимые</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', display: 'grid', gap: 2 }}>
              <div>Сборная: {player.favoriteNationalTeam?.name ?? '—'}</div>
              <div>Клуб: {player.favoriteClub?.name ?? '—'}</div>
              <div>Игрок: {player.favoritePlayer?.name ?? '—'}</div>
            </div>
          </div>
        </div>

        {player.lastAction && <p className="modal__text" style={{ marginBottom: 14 }}>Последнее: {player.lastAction}</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/profile/${player.profileId}`} className="btn btn--primary">Открыть профиль</Link>
          <button type="button" className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

function EventModal({
  pending,
  me,
  players,
  onTactics,
  onVar,
  onPassage,
  onLocker,
  onPackChoice,
  onPenalty,
  onDribble,
  onSuperSub,
  onCorner,
  onFoul,
  onRedVar,
  onAttackBreak,
  onLastMinute,
  onPartnerInvite,
  onPartnerRespond,
  onPartnerChoice,
  onTrainingShot,
  onRevealGuessClue,
  onSubmitGuessAnswer,
  onFanSector,
  onCoachContract,
  onCancel,
}: {
  pending: Pending;
  me: PlayerView;
  players: PlayerView[];
  onTactics: (delta: number) => void;
  onVar: (contest: boolean) => void;
  onPassage: (targetId: string | null) => void;
  onLocker: (remove: EffectCode | 'advance') => void;
  onPackChoice: (packKind: 'national' | 'club') => void;
  onPenalty: (choice: 'shoot' | 'pass') => void;
  onDribble: (choice: 'beat' | 'pass') => void;
  onSuperSub: (choice: 'buff' | 'shield') => void;
  onCorner: (choice: 'simple' | 'risky') => void;
  onFoul: (choice: 'defend' | 'dispute') => void;
  onRedVar: (targetProfileId: string) => void;
  onAttackBreak: (targetProfileId: string | null) => void;
  onLastMinute: (choice: 'stop' | 'continue') => void;
  onPartnerInvite: (targetProfileId: string | null) => void;
  onPartnerRespond: (accept: boolean) => void;
  onPartnerChoice: (choice: string) => void;
  onTrainingShot: () => void;
  onRevealGuessClue: () => void;
  onSubmitGuessAnswer: (answer: string) => void;
  onFanSector: (submit: boolean) => void;
  onCoachContract: (sign: boolean) => void;
  onCancel: () => void;
}) {
  const [guess, setGuess] = useState('');
  const others = players.filter((p) => !p.isMe && p.position < 80);

  if (pending.kind === 'tactics') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Тактическая схема">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 10 · Тактическая схема</div>
          <h2 className="modal__title">Поправить бросок?</h2>
          <p className="modal__text">
            На кубике выпало {pending.payload.base}. Схема позволяет сдвинуть итог на единицу. Минимум — одна клетка.
          </p>
          <div className="odds">
            <div className="odds__item">
              <span className="odds__value">{Math.max(1, pending.payload.value - 1)}</span>
              <span className="odds__label">минус 1</span>
            </div>
            <div className="odds__item">
              <span className="odds__value">{pending.payload.value}</span>
              <span className="odds__label">оставить</span>
            </div>
            <div className="odds__item">
              <span className="odds__value">{pending.payload.value + 1}</span>
              <span className="odds__label">плюс 1</span>
            </div>
          </div>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={() => onTactics(-1)}>
              −1
            </button>
            <button type="button" className="btn btn--primary" onClick={() => onTactics(0)}>
              Оставить
            </button>
            <button type="button" className="btn" onClick={() => onTactics(1)}>
              +1
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'var') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="VAR">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 09 · VAR</div>
          <h2 className="modal__title">Спорить с судьёй?</h2>
          <p className="modal__text">
            Принять решение — минус одна клетка. Оспорить — монетка: плюс три или минус три. Щитки здесь не работают.
          </p>
          <div className="odds">
            <div className="odds__item">
              <span className="odds__value" style={{ color: 'var(--lime)' }}>
                +3
              </span>
              <span className="odds__label">50%</span>
            </div>
            <div className="odds__item">
              <span className="odds__value" style={{ color: 'var(--danger)' }}>
                −3
              </span>
              <span className="odds__label">50%</span>
            </div>
          </div>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={() => onVar(false)}>
              Принять −1
            </button>
            <button type="button" className="btn btn--primary" onClick={() => onVar(true)}>
              Оспорить
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'locker') {
    const negatives = me.effects.filter((e) => NEGATIVE_EFFECTS.includes(e.code));
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Раздевалка">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 07 · Раздевалка</div>
          <h2 className="modal__title">Что снимаем?</h2>
          <p className="modal__text">Можно убрать один негативный эффект. Если убрать нечего - получишь шаг вперёд.</p>
          <div className="modal__actions">
            {negatives.map((effect) => (
              <button key={effect.code} type="button" className="btn" onClick={() => onLocker(effect.code)}>
                Снять {effect.code === 'gazon' ? 'скользкий газон' : effect.code === 'yellow_card' ? 'жёлтую карточку' : effect.code === 'press_trap' ? 'прессинг-ловушку' : effect.code === 'dirty_time' ? 'грязное время' : effect.code === 'broken_boot' ? 'сломанный бутс' : 'панику на трибунах'}
              </button>
            ))}
            {negatives.length === 0 && (
              <button type="button" className="btn btn--primary" onClick={() => onLocker('advance')}>
                Нет негатива +1
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'pack_choice') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Пак на выбор">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 19 · Пак на выбор</div>
          <h2 className="modal__title">Какой пак открыть?</h2>
          <p className="modal__text">Выбери один пак. После выбора он будет зачислен сразу.</p>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => onPackChoice('national')}>Сборные</button>
            <button type="button" className="btn" onClick={() => onPackChoice('club')}>Клубы</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'penalty') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Пенальти">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 21 · Пенальти</div>
          <h2 className="modal__title">Бить или пасовать?</h2>
          <p className="modal__text">Бить: 70% +3, 30% 0 (риск, щитки не спасают). Пас: +1 гарантированно.</p>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => onPenalty('shoot')}>Бить (70%/+3)</button>
            <button type="button" className="btn" onClick={() => onPenalty('pass')}>Пас (+1)</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'dribble') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Дриблинг">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 23 · Дриблинг</div>
          <h2 className="modal__title">Обыграть или сбросить?</h2>
          <p className="modal__text">Обыграть: 60% +2, 40% -1 (риск, щитки не спасают). Сбросить: +1.</p>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => onDribble('beat')}>Обыграть (60%/+2)</button>
            <button type="button" className="btn" onClick={() => onDribble('pass')}>Сбросить (+1)</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'super_sub') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Суперзамена">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 27 · Суперзамена</div>
          <h2 className="modal__title">Какое усиление взять?</h2>
          <p className="modal__text">+2 к следующему броску (1 бросок) или Щиток. Если щиток уже есть, вместо него +1 клетка.</p>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => onSuperSub('buff')}>+2 к броску</button>
            <button type="button" className="btn" onClick={() => onSuperSub('shield')}>Щиток</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'corner') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Угловой">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 28 · Угловой розыгрыш</div>
          <h2 className="modal__title">Как разыграть?</h2>
          <p className="modal__text">Простой: +1. Розыгрыш: 50% +3, 50% -1.</p>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => onCorner('risky')}>Розыгрыш (50/50)</button>
            <button type="button" className="btn" onClick={() => onCorner('simple')}>Простой (+1)</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'foul') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Фол в штрафной">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 29 · Фол в штрафной</div>
          <h2 className="modal__title">Как поступить?</h2>
          <p className="modal__text">Защититься: -1. Спорить: 50% ничего, 50% -3 (щитки не спасают).</p>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={() => onFoul('defend')}>Защититься (-1)</button>
            <button type="button" className="btn btn--primary" onClick={() => onFoul('dispute')}>Спорить (50/50)</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'red_var') {
    const targets = players.filter((p) => !p.isMe && !p.finishedAt && p.position < 80);
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Красный VAR">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 33 · Красный VAR</div>
          <h2 className="modal__title">Кого атаковать?</h2>
          <p className="modal__text">50%: цель -3 клетки. 50%: ты -2 клетки. Новые клетки не срабатывают.</p>
          <div className="list">
            {targets.map((p) => (
              <button key={p.profileId} type="button" className="list-row" onClick={() => onRedVar(p.profileId)} style={{ textAlign: 'left' }}>
                <span className="list-row__main"><span className="list-row__title">{p.nickname}</span><span className="list-row__meta">Клетка {p.position}</span></span>
              </button>
            ))}
            {targets.length === 0 && <p className="modal__text">Нет доступных целей.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'attack_break') {
    const targets = players.filter((p) => !p.isMe && !p.finishedAt && p.position < 80 && p.position > me.position);
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Срыв атаки">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 34 · Срыв атаки</div>
          <h2 className="modal__title">Кого сбить впереди?</h2>
          <p className="modal__text">Выбранный соперник впереди получает -2 клетки. Если впереди никого нет - ты получаешь +1.</p>
          <div className="list">
            {targets.map((p) => (
              <button key={p.profileId} type="button" className="list-row" onClick={() => onAttackBreak(p.profileId)} style={{ textAlign: 'left' }}>
                <span className="list-row__main"><span className="list-row__title">{p.nickname}</span><span className="list-row__meta">Клетка {p.position}</span></span>
              </button>
            ))}
            {targets.length === 0 && (
              <button type="button" className="btn btn--primary" onClick={() => onAttackBreak(null)}>Впереди никого: +1 мне</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'last_minute') {
    const { stage, currentReward } = pending.payload;
    const nextReward = stage === 1 ? 3 : 5;
    const successPct = stage === 1 ? 60 : 40;
    const failPct = 100 - successPct;
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Последняя минута">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 15 · Последняя минута</div>
          <h2 className="modal__title">Забрать или рискнуть?</h2>
          <p className="modal__text">
            Текущая награда: +{currentReward}. Рискнуть: {successPct}% шанс +{nextReward}, {failPct}% шанс 0. Провал обнуляет только награду этого события.
          </p>
          <div className="odds">
            <div className="odds__item">
              <span className="odds__value" style={{ color: 'var(--lime)' }}>+{nextReward}</span>
              <span className="odds__label">{successPct}%</span>
            </div>
            <div className="odds__item">
              <span className="odds__value" style={{ color: 'var(--danger)' }}>0</span>
              <span className="odds__label">{failPct}%</span>
            </div>
          </div>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={() => onLastMinute('stop')}>Забрать +{currentReward}</button>
            <button type="button" className="btn btn--primary" onClick={() => onLastMinute('continue')}>Рискнуть</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'training_base') {
    const round = Number(pending.payload.round ?? 1);
    const hits = Number(pending.payload.hits ?? 0);
    const shots = Array.isArray(pending.payload.shots) ? pending.payload.shots as Array<{round:number;hit:boolean}> : [];
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Тренировочная база">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 11 · Тренировочная база</div>
          <h2 className="modal__title">3 удара, нужно 2 попадания</h2>
          <p className="modal__text">Попаданий: {hits}. Удар {Math.min(round,3)} из 3. Награда за 2+ попадания: +2 клетки.</p>
          <div className="list">
            {shots.map((s) => (
              <div key={s.round} className="list-row"><span className="list-row__main"><span className="list-row__title">Удар {s.round}</span><span className="list-row__meta">{s.hit ? 'Попадание' : 'Промах'}</span></span></div>
            ))}
          </div>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={onTrainingShot}>Ударить</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'guess_player') {
    const revealed = Number(pending.payload.revealed ?? 1);
    const clues = Array.isArray(pending.payload.clues) ? pending.payload.clues.map(String) : [];
    const labels = ['Позиция', 'Страна', 'Бывший клуб', 'Текущая команда'];
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Узнай футболиста">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 12 · Узнай футболиста</div>
          <h2 className="modal__title">Угадай футболиста</h2>
          <p className="modal__text">Одна попытка ответа. Чем меньше подсказок открыто, тем больше награда.</p>
          <div className="list">
            {labels.slice(0, revealed).map((label, i) => (
              <div key={label} className="list-row"><span className="list-row__main"><span className="list-row__title">{label}</span><span className="list-row__meta">{clues[i] ?? '—'}</span></span></div>
            ))}
          </div>
          <div className="modal__actions" style={{ display: 'grid', gap: 8 }}>
            {revealed < 4 && <button type="button" className="btn" onClick={onRevealGuessClue}>Открыть подсказку</button>}
            <input className="input" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Фамилия футболиста" />
            <button type="button" className="btn btn--primary" onClick={() => onSubmitGuessAnswer(guess)} disabled={!guess.trim()}>Ответить</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'fan_sector') {
    const task = typeof pending.payload.task === 'string' ? pending.payload.task : 'Выполни задание и отправь на проверку администратору.';
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Фан-сектор">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 13 · Фан-сектор</div>
          <h2 className="modal__title">Задание для фаната</h2>
          <p className="modal__text">{task}</p>
          <p className="modal__text">После отправки администратор подтвердит выполнение. Пока идёт проверка, бросок не блокируется.</p>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={() => onFanSector(false)}>Пропустить</button>
            <button type="button" className="btn btn--primary" onClick={() => onFanSector(true)}>Отправить на проверку</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'coach_contract') {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Контракт тренера">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 17 · Контракт тренера</div>
          <h2 className="modal__title">Подписать контракт?</h2>
          <p className="modal__text">На следующий игровой день: ответить минимум на 80% обычных вопросов и угадать не менее 2/3. Выполнил — +4, не выполнил — −2, отказался — ничего.</p>
          <div className="modal__actions">
            <button type="button" className="btn" onClick={() => onCoachContract(false)}>Отказаться</button>
            <button type="button" className="btn btn--primary" onClick={() => onCoachContract(true)}>Подписать</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'rematch' || pending.kind === 'simulation' || pending.kind === 'gentleman') {
    const phase = String(pending.payload.phase ?? '');
    const initiatorId = typeof pending.payload.initiatorId === 'string' ? pending.payload.initiatorId : null;
    const partnerId = typeof pending.payload.partnerId === 'string' ? pending.payload.partnerId : null;
    const isInitiator = me.profileId === initiatorId;
    const partnerLabel = pending.kind === 'rematch' ? 'Ответный матч' : pending.kind === 'simulation' ? 'Симуляция' : 'Джентльменское соглашение';
    const mechanicLabel = pending.kind === 'rematch' ? 'Механика 14 · Ответный матч' : pending.kind === 'simulation' ? 'Механика 16 · Симуляция' : 'Механика 18 · Джентльменское соглашение';

    if (phase === 'pick_partner') {
      const targets = players.filter((p) => !p.isMe && !p.finishedAt && p.position < 80);
      return (
        <div className="modal" role="dialog" aria-modal="true" aria-label={partnerLabel}>
          <div className="modal__card">
            <div className="modal__eyebrow">{mechanicLabel}</div>
            <h2 className="modal__title">Кого вызвать?</h2>
            <p className="modal__text">Можно выбрать соперника или отказаться без штрафа.</p>
            <div className="list">
              {targets.map((p) => (
                <button key={p.profileId} type="button" className="list-row" onClick={() => onPartnerInvite(p.profileId)} style={{ textAlign: 'left' }}>
                  <span className="list-row__main"><span className="list-row__title">{p.nickname}</span><span className="list-row__meta">Клетка {p.position}</span></span>
                </button>
              ))}
              <button type="button" className="btn" onClick={() => onPartnerInvite(null)}>Отказаться без штрафа</button>
            </div>
          </div>
        </div>
      );
    }

    if (phase === 'partner_response') {
      return (
        <div className="modal" role="dialog" aria-modal="true" aria-label={partnerLabel}>
          <div className="modal__card">
            <div className="modal__eyebrow">{mechanicLabel}</div>
            <h2 className="modal__title">Принять вызов?</h2>
            <p className="modal__text">Отказ не считается поражением и не даёт штрафа.</p>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => onPartnerRespond(false)}>Отказаться</button>
              <button type="button" className="btn btn--primary" onClick={() => onPartnerRespond(true)}>Принять</button>
            </div>
          </div>
        </div>
      );
    }

    if (phase === 'secret_choice' && (pending.kind === 'simulation' || pending.kind === 'gentleman')) {
      if (pending.kind === 'simulation') {
        const attacker = isInitiator;
        return (
          <div className="modal" role="dialog" aria-modal="true" aria-label="Симуляция">
            <div className="modal__card">
              <div className="modal__eyebrow">{mechanicLabel}</div>
              <h2 className="modal__title">{attacker ? 'Как сыграешь?' : 'Проверять или нет?'}</h2>
              <p className="modal__text">Выбор тайный. Результат раскроется после ответа обоих.</p>
              <div className="modal__actions">
                {attacker ? (
                  <>
                    <button type="button" className="btn" onClick={() => onPartnerChoice('honest')}>Честно</button>
                    <button type="button" className="btn btn--primary" onClick={() => onPartnerChoice('simulate')}>Симулировать</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn" onClick={() => onPartnerChoice('play_on')}>Не проверять</button>
                    <button type="button" className="btn btn--primary" onClick={() => onPartnerChoice('check')}>Проверить</button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Джентльменское соглашение">
          <div className="modal__card">
            <div className="modal__eyebrow">{mechanicLabel}</div>
            <h2 className="modal__title">Сотрудничать или забрать?</h2>
            <p className="modal__text">Выбор тайный. Решения раскроются после ответа обоих.</p>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => onPartnerChoice('cooperate')}>Сотрудничать</button>
              <button type="button" className="btn btn--primary" onClick={() => onPartnerChoice('take')}>Забрать себе</button>
            </div>
          </div>
        </div>
      );
    }

    if (phase === 'shootout' && pending.kind === 'rematch') {
      const rematch = (pending.payload.rematch as any) ?? { round: 1, initiatorScore: 0, partnerScore: 0 };
      const round = Number(rematch.round ?? 1);
      const attackerIsInitiator = round % 2 === 1;
      const iAmAttacker = (attackerIsInitiator && isInitiator) || (!attackerIsInitiator && !isInitiator);
      return (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Ответный матч">
          <div className="modal__card">
            <div className="modal__eyebrow">{mechanicLabel}</div>
            <h2 className="modal__title">{iAmAttacker ? 'Куда бьёшь?' : 'Куда прыгаешь?'}</h2>
            <p className="modal__text">Раунд {round}. Счёт {Number(rematch.initiatorScore ?? 0)}:{Number(rematch.partnerScore ?? 0)}. Выбор тайный до ответа обоих.</p>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => onPartnerChoice('left')}>Влево</button>
              <button type="button" className="btn" onClick={() => onPartnerChoice('center')}>В центр</button>
              <button type="button" className="btn btn--primary" onClick={() => onPartnerChoice('right')}>Вправо</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label={partnerLabel}>
        <div className="modal__card">
          <div className="modal__eyebrow">{mechanicLabel}</div>
          <h2 className="modal__title">Ожидание</h2>
          <p className="modal__text">Событие обрабатывается. Обнови страницу, если состояние не меняется.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Голевая передача">
      <div className="modal__card">
        <div className="modal__eyebrow">Механика 03 · Голевая передача</div>
        <h2 className="modal__title">Кому пас?</h2>
        <p className="modal__text">
          Получатель шагнёт на клетку вперёд. Событие его новой клетки не сработает — цепочек нет.
        </p>
        <div className="list">
          <button type="button" className="list-row" onClick={() => onPassage(null)} style={{ textAlign: 'left' }}>
            <span className="list-row__main">
              <span className="list-row__title">Остаться на месте</span>
              <span className="list-row__meta">Передачу придержим</span>
            </span>
          </button>
          {others.map((player) => (
            <button
              key={player.profileId}
              type="button"
              className="list-row"
              onClick={() => onPassage(player.profileId)}
              style={{ textAlign: 'left' }}
            >
              <PlayerBadge player={player} size="sm" />
              <span className="list-row__main">
                <span className="list-row__title">{player.nickname}</span>
                <span className="list-row__meta">Клетка {player.position} → {Math.min(80, player.position + 1)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="modal__actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
