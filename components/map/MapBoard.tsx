'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { mechanic } from '@/lib/game/catalog';
import { flavorMap, type PlainFlavor } from '@/lib/game/cell-flavor';
import { buildPathD, cellPoint, stackOffset } from '@/lib/game/map-layout';
import { describeEffects } from '@/lib/game/engine';
import type { Rect } from '@/lib/ui/card-placement';
import type { CellView, PlayerView } from '@/lib/types';
import { CellCard } from './CellCard';

type MapBoardProps = {
  cells: CellView[];
  players: PlayerView[];
  onSelectPlayer: (player: PlayerView | null) => void;
  selectedPlayerId: string | null;
  /** 1 / текущий масштаб: размеры маркеров не зависят от зума. */
  inverseScale?: number;
  /** Показывать маршрут и клетки (переключатель вида карты). */
  showOverlay?: boolean;
};

type ActiveCard = {
  idx: number;
  anchor: Rect;
  source: 'hover' | 'pin' | 'focus';
};

const PATH_D = buildPathD();

function polarityOf(code: string | null): string {
  if (!code) return 'plain';
  if (code === 'secret') return 'neutral';
  return mechanic(code)?.polarity ?? 'neutral';
}

function anchorOf(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function MapBoard({
  cells,
  players,
  onSelectPlayer,
  selectedPlayerId,
  inverseScale = 1,
  showOverlay = true,
}: MapBoardProps) {
  const [active, setActive] = useState<ActiveCard | null>(null);

  const byCell = useMemo(() => {
    const groups = new Map<number, PlayerView[]>();
    for (const player of players) {
      const list = groups.get(player.position) ?? [];
      list.push(player);
      groups.set(player.position, list);
    }
    return groups;
  }, [players]);

  const flavors = useMemo(() => {
    const plainCells = cells.filter((cell) => cell.kind === 'plain').map((cell) => cell.idx);
    return flavorMap(plainCells);
  }, [cells]);

  const myPosition = players.find((p) => p.isMe)?.position ?? 1;
  const activeCell = active ? cells.find((c) => c.idx === active.idx) ?? null : null;
  const activeFlavor: PlainFlavor | null = activeCell ? flavors.get(activeCell.idx) ?? null : null;

  const open = useCallback((cell: CellView, element: Element, source: ActiveCard['source']) => {
    setActive({ idx: cell.idx, anchor: anchorOf(element), source });
  }, []);

  const closeIf = useCallback((idx: number, source: ActiveCard['source']) => {
    setActive((current) =>
      current && current.idx === idx && current.source === source ? null : current,
    );
  }, []);

  useEffect(() => {
    if (!active) return;

    let pressed = false;
    let pressX = 0;
    let pressY = 0;

    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      pressed = true;
      pressX = event.clientX;
      pressY = event.clientY;
      if (target?.closest('.cell')) return;
      setActive(null);
    };

    const onMove = (event: PointerEvent) => {
      if (!pressed) return;
      if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > 6) {
        pressed = false;
        setActive(null);
      }
    };

    const onUp = () => {
      pressed = false;
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null);
    };

    const onWheel = () => setActive(null);

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [active]);

  return (
    <>
      {showOverlay && (
        <>
          <svg className="map-layer map-layer--svg" viewBox="0 0 4096 2048" aria-hidden="true">
            <defs>
              <linearGradient id="routeLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffd166" />
                <stop offset="28%" stopColor="#d8ff74" />
                <stop offset="62%" stopColor="#8ff0b8" />
                <stop offset="100%" stopColor="#7fd3ff" />
              </linearGradient>
              <linearGradient id="routeGlow" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffd166" stopOpacity="0.9" />
                <stop offset="40%" stopColor="#d8ff74" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#7fd3ff" stopOpacity="0.9" />
              </linearGradient>
              <filter id="routeSoftGlow" x="-8%" y="-20%" width="116%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0"
                  result="glow"
                />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d={PATH_D}
              fill="none"
              stroke="#071018"
              strokeWidth="44"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.28"
            />
            <path
              d={PATH_D}
              fill="none"
              stroke="rgba(20, 38, 54, 0.55)"
              strokeWidth="28"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={PATH_D}
              fill="none"
              stroke="url(#routeGlow)"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.22"
              filter="url(#routeSoftGlow)"
            />
            <path
              d={PATH_D}
              fill="none"
              stroke="rgba(255, 255, 255, 0.88)"
              strokeWidth="15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={PATH_D}
              fill="none"
              stroke="url(#routeLine)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.98"
            />
            <path
              d={PATH_D}
              fill="none"
              stroke="rgba(255, 255, 255, 0.55)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1 22"
              opacity="0.9"
            />
          </svg>

          <div className="map-layer map-layer--markers">
            {cells.map((cell) => {
              const point = cellPoint(cell.idx);
              const polarity = polarityOf(cell.mechanicCode);
              const isCurrent = players.some((p) => p.position === cell.idx && p.isMe);
              const flavor = flavors.get(cell.idx);
              const eventName =
                cell.mechanicCode === 'secret' ? 'секрет' : mechanic(cell.mechanicCode)?.name;
              const label =
                cell.kind === 'event'
                  ? `Клетка ${cell.idx}, ${eventName ?? 'событие'}`
                  : cell.kind === 'start'
                    ? `Клетка ${cell.idx}, старт`
                    : cell.kind === 'finish'
                      ? `Клетка ${cell.idx}, финиш`
                      : `Клетка ${cell.idx}, ${flavor?.title ?? 'обычная клетка'}, обычная клетка`;
              const isOpen = active?.idx === cell.idx;

              return (
                <button
                  key={cell.idx}
                  type="button"
                  className="cell"
                  data-kind={cell.kind}
                  data-polarity={polarity}
                  data-current={isCurrent}
                  data-passed={cell.idx < myPosition}
                  data-open={isOpen}
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  aria-label={label}
                  aria-describedby={isOpen ? 'cell-card' : undefined}
                  onMouseEnter={(event) => open(cell, event.currentTarget, 'hover')}
                  onMouseLeave={() => closeIf(cell.idx, 'hover')}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(':focus-visible')) open(cell, event.currentTarget, 'focus');
                  }}
                  onBlur={() => closeIf(cell.idx, 'focus')}
                  onClick={(event) => {
                    const pointerType = (event.nativeEvent as PointerEvent).pointerType;
                    const isTouch = Boolean(pointerType && pointerType !== 'mouse');
                    if (isTouch || event.detail === 0) {
                      if (isOpen) setActive(null);
                      else open(cell, event.currentTarget, 'pin');
                    }
                  }}
                >
                  {cell.kind === 'finish' ? '★' : cell.idx}
                </button>
              );
            })}
          </div>
        </>
      )}

      {showOverlay && (
      <div className="map-layer map-layer--players">
        {Array.from(byCell.entries()).map(([cellIdx, group]) =>
          group.map((player, slot) => {
            const point = cellPoint(cellIdx);
            const offset = stackOffset(slot, group.length);
            const selected = player.profileId === selectedPlayerId;
            return (
              <button
                key={player.profileId}
                type="button"
                className="token"
                data-me={player.isMe}
                data-finished={player.position >= 80}
                aria-label={`${player.nickname}, клетка ${player.position}${
                  player.isMe ? ', это ты' : ''
                }`}
                style={{
                  left: `${point.x * 100}%`,
                  top: `${point.y * 100}%`,
                  marginLeft: `${offset.x * inverseScale}px`,
                  marginTop: `${offset.y * inverseScale}px`,
                  zIndex: selected ? 12 : undefined,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectPlayer(player);
                }}
              >
                <span
                  className="token__body"
                  style={{
                    background: `linear-gradient(150deg, ${avatarColor(player.nickname, 0)}, ${avatarColor(
                      player.nickname,
                      1,
                    )})`,
                  }}
                >
                  {player.nickname.slice(0, 1).toUpperCase()}
                </span>
                <span className="token__name">{player.nickname}</span>
              </button>
            );
          }),
        )}
      </div>
      )}

      {showOverlay && activeCell && active && (
        <CellCard
          cell={activeCell}
          flavor={activeFlavor}
          anchor={active.anchor}
          phase={active.idx === myPosition ? 'current' : active.idx < myPosition ? 'passed' : 'ahead'}
        />
      )}
    </>
  );
}

const PALETTES = [
  ['#d8ff74', '#8fd0f0'],
  ['#ffd08a', '#e4573d'],
  ['#c7b8ff', '#5aa9e6'],
  ['#a8f0d8', '#4fae8a'],
  ['#ffe08a', '#f2c14e'],
  ['#f6b6c8', '#c05c7a'],
];

export function avatarColor(name: string, index: 0 | 1): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  const palette = PALETTES[hash % PALETTES.length] ?? PALETTES[0]!;
  return palette[index] ?? palette[0]!;
}

export function PlayerBadge({ player, size }: { player: PlayerView; size?: 'sm' }) {
  return (
    <span
      className={`avatar ${size === 'sm' ? 'avatar--sm' : ''}`}
      style={{
        background: `linear-gradient(150deg, ${avatarColor(player.nickname, 0)}, ${avatarColor(
          player.nickname,
          1,
        )})`,
      }}
      aria-hidden="true"
    >
      {player.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function effectSummary(player: PlayerView): string[] {
  return describeEffects({ position: player.position, effects: player.effects, finished: false }).map(
    (effect) => `${effect.label}${effect.charges > 1 ? ` ×${effect.charges}` : ''}`,
  );
}
