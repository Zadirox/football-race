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
  chooseLockerAction,
  choosePassageAction,
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
  | { kind: 'locker'; payload: Record<string, never> };

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

  return { id: view.id, kind: view.kind, payload: {} };
}

/** Ключ идемпотентности: один и тот же на повторный клик, новый — на следующий бросок. */
function newRollKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type LastRoll = { base: number; value: number; tier: DiceTier; from: number; to: number };

/** Грань на кубике во время броска: крутится, потом замирает на результате. */
type Tumble = { tier: DiceTier; face: number; settled: boolean };

/** Как часто меняется грань при прокрутке. */
const TUMBLE_TICK_MS = 70;
/** Сколько держится финальная грань перед возвратом к обычному виду. */
const TUMBLE_SETTLE_MS = 280;

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
  const [feedOpen, setFeedOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const feedLengthRef = useRef(snapshot.activity.length);
  const [liveMuted, setLiveMuted] = useState(true);

  // На телефоне лента по умолчанию свёрнута: карта важнее простыни текста.
  // Ширину читаем только на клиенте, чтобы не ломать SSR-разметку.
  useEffect(() => {
    if (window.innerWidth <= 900) setFeedOpen(false);
  }, []);

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
    (state: PlayerState, value: number, tier: DiceTier, base: number) => {
      if (!me) return;
      const from = state.position;
      const landed = moveBy(state, value);
      const cell = snapshot.cells[landed.position - 1];
      const outcome = resolveCell(landed, cell?.mechanicCode ?? null, me.nickname);
      const final = outcome.state;

      syncMe(final);

      pushFeed(
        `${me.nickname} бросает ${TIER_LABEL[tier]} кубик: ${base}${value !== base ? ` → ${value}` : ''}`,
        'roll',
      );
      if (landed.position !== from) {
        pushFeed(`${me.nickname} идёт на ${landed.position - from} ${pluralCells(landed.position - from)} вперёд`, 'system');
      }
      if (cell?.mechanicCode) pushFeed(outcome.log, eventKind(cell.mechanicCode));

      const polarity = mechanic(cell?.mechanicCode ?? null)?.polarity;
      const landSound: Parameters<typeof play>[0] =
        polarity === 'positive' ? 'positive' : polarity === 'negative' || polarity === 'trap' ? 'negative' : 'land';
      const steps = stepSequence(from, final.position);
      const landingDelay = walkDelay(steps.length);

      if (landingDelay === 0) {
        play(landSound);
        if (outcome.awaiting) setPending({ kind: outcome.awaiting, payload: {} });
      } else {
        window.setTimeout(() => play(landSound), landingDelay);
        if (outcome.awaiting) {
          const awaiting = outcome.awaiting;
          window.setTimeout(() => setPending({ kind: awaiting, payload: {} }), landingDelay);
        }
      }

      setLastRoll({ base, value, tier, from, to: final.position });
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

      setDice((prev) => ({ ...prev, [tier]: Math.max(0, prev[tier] - 1) }));

      if (hasEffect(afterMods, 'tactics')) {
        syncMe(afterMods);
        setLastRoll({ base, value, tier, from: me.position, to: me.position });
        pushFeed(
          `${me.nickname} бросает ${TIER_LABEL[tier]} кубик: ${base}${value !== base ? ` → ${value}` : ''}`,
          'roll',
        );
        setPending({ kind: 'tactics', payload: { value, base, tier, from: me.position } });
        play('neutral');
        settleTumble(base);
        setBusy(false);
        return;
      }

      finishMove(afterMods, value, tier, base);
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
      settleTumble();
      router.refresh();
      setBusy(false);
      return;
    }

    window.setTimeout(() => demoRoll(tier), 760);
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
          ? 'Тактическая схема: оставляем как есть.'
          : `Тактическая схема: ${delta > 0 ? 'плюс' : 'минус'} один к броску.`,
        'neutral',
      );
      setPending(null);
      setBusy(false);
      finishMove(state, adjusted, tier, base);
      setLastRoll({ base, value: adjusted, tier, from, to: from });
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
      setLastRoll((prev) => (prev ? { ...prev, to: outcome.state.position } : prev));
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
      setLastRoll((prev) => (prev ? { ...prev, to: outcome.state.position } : prev));
      setPending(null);
      play('reward');
    },
    [me, pending, pushFeed, runServerChoice, snapshot.demo, syncMe],
  );

  const toggleMute = () => {
    const next = !liveMuted;
    setLiveMuted(next);
    setMuted(next);
    if (!next) startAmbient();
  };

  const total = totalDice(dice);

  const rollDisabled =
    !canPlay || !me || busy || isWalking || Boolean(pending) || total === 0 || me.position >= 80;
  const rollHelper = !canPlay
    ? 'Играет основной состав'
    : !me
      ? 'Ты зритель: смотри и болей'
      : isWalking
        ? 'Идём по клеткам'
        : pending
          ? 'Сначала реши событие'
          : me.position >= 80
            ? 'Ты на финише'
            : total === 0
              ? 'Кубиков нет. Сделай предикты'
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
          <div ref={panZoom.canvasRef} className="map-canvas">
            <MapScene />
            <MapBoard
              cells={snapshot.cells}
              players={displayed}
              selectedPlayerId={selectedPlayer?.profileId ?? null}
              inverseScale={1 / Math.max(0.0001, panZoom.scale)}
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
          <button
            type="button"
            className="icon-btn"
            data-on={!liveMuted}
            onClick={toggleMute}
            aria-label={liveMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {liveMuted ? '🔇' : '🔊'}
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
        {lastRoll && (
          <div className="dice-helper">
            <strong style={{ color: 'var(--lime)', fontFamily: 'var(--font-mono)' }}>{lastRoll.value}</strong>{' '}
            {lastRoll.value === 1 ? 'клетка' : lastRoll.value < 5 ? 'клетки' : 'клеток'} ·{' '}
            {TIER_LABEL[lastRoll.tier]}
          </div>
        )}
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
      </div>

      {toast && (
        <div className="toast" data-kind={toast.kind} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}

      {selectedDisplayed && (
        <PlayerPopover player={selectedDisplayed} onClose={() => setSelectedPlayer(null)} />
      )}

      {pending && me && (
        <EventModal
          pending={pending}
          me={me}
          players={players}
          onTactics={chooseTactics}
          onVar={chooseVar}
          onPassage={choosePassage}
          onLocker={chooseLocker}
          onCancel={() => {
            if (!snapshot.demo) {
              setToast({ text: 'Событие нужно решить: оно держит следующий бросок', kind: 'info' });
              return;
            }
            setPending(null);
          }}
        />
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
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Профиль ${player.nickname}`} onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} style={{ width: 'min(420px, 100%)' }}>
        <div className="modal__eyebrow">
          <span>Участник</span>
          <span>{player.role === 'admin' ? 'админ' : player.role === 'spectator' ? 'зритель' : 'игрок'}</span>
          {player.isMe && <span className="chip chip--positive">это ты</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span
            className="avatar"
            style={{
              width: 48,
              height: 48,
              fontSize: 18,
              background: `linear-gradient(150deg, ${avatarColor(player.nickname, 0)}, ${avatarColor(player.nickname, 1)})`,
            }}
          >
            {player.nickname.slice(0, 1)}
          </span>
          <div>
            <h2 className="modal__title" style={{ margin: 0 }}>
              {player.nickname}
            </h2>
            <div className="card__meta">Клетка {player.position} из 80</div>
          </div>
        </div>

        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="stat__label">Очки</div>
            <div className="stat__value stat__value--lime">{player.points}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Точность</div>
            <div className="stat__value">{formatAccuracy(player.answered ? player.correct / player.answered : null)}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Кубики</div>
            <div className="stat__value">
              {player.dice.gold + player.dice.silver + player.dice.bronze + player.dice.wood}
            </div>
          </div>
        </div>

        <div className="card__meta" style={{ marginBottom: 6 }}>
          Эффекты
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {effects.length === 0 ? (
            <span className="chip chip--muted">чисто</span>
          ) : (
            effects.map((effect) => (
              <span key={effect} className="chip chip--info">
                {effect}
              </span>
            ))
          )}
        </div>

        {player.lastAction && <p className="modal__text">Последнее: {player.lastAction}</p>}

        <button type="button" className="btn btn--block" onClick={onClose}>
          Закрыть
        </button>
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
  onCancel,
}: {
  pending: Pending;
  me: PlayerView;
  players: PlayerView[];
  onTactics: (delta: number) => void;
  onVar: (contest: boolean) => void;
  onPassage: (targetId: string | null) => void;
  onLocker: (remove: EffectCode | 'advance') => void;
  onCancel: () => void;
}) {
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
    const negatives = me.effects.filter((e) => e.code === 'gazon' || e.code === 'yellow_card');
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Раздевалка">
        <div className="modal__card">
          <div className="modal__eyebrow">Механика 07 · Раздевалка</div>
          <h2 className="modal__title">Что снимаем?</h2>
          <p className="modal__text">Один негативный эффект можно снять. Прошлые откаты и проигрыши остаются.</p>
          <div className="modal__actions">
            {negatives.map((effect) => (
              <button key={effect.code} type="button" className="btn" onClick={() => onLocker(effect.code)}>
                Снять {effect.code === 'gazon' ? 'скользкий газон' : 'жёлтую карточку'}
              </button>
            ))}
            {negatives.length === 0 && (
              <button type="button" className="btn btn--primary" onClick={() => onLocker('advance')}>
                Шаг вперёд +1
              </button>
            )}
          </div>
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
