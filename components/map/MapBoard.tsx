'use client';

import { useMemo, useState } from 'react';
import { mechanic, POLARITY_LABEL } from '@/lib/game/catalog';
import { buildPathD, cellPoint, stackOffset } from '@/lib/game/map-layout';
import { describeEffects } from '@/lib/game/engine';
import type { CellView, PlayerView } from '@/lib/types';

type MapBoardProps = {
  cells: CellView[];
  players: PlayerView[];
  onSelectPlayer: (player: PlayerView | null) => void;
  selectedPlayerId: string | null;
  /** 1 / текущий масштаб: размеры маркеров не зависят от зума. */
  inverseScale?: number;
};

const PATH_D = buildPathD();

function polarityOf(code: string | null): string {
  if (!code) return 'plain';
  return mechanic(code)?.polarity ?? 'neutral';
}

export function MapBoard({ cells, players, onSelectPlayer, selectedPlayerId, inverseScale = 1 }: MapBoardProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const byCell = useMemo(() => {
    const groups = new Map<number, PlayerView[]>();
    for (const player of players) {
      const list = groups.get(player.position) ?? [];
      list.push(player);
      groups.set(player.position, list);
    }
    return groups;
  }, [players]);

  const hoveredCell = hovered === null ? null : cells.find((c) => c.idx === hovered) ?? null;
  const hoveredPoint = hovered === null ? null : cellPoint(hovered);
  const hoveredMechanic = mechanic(hoveredCell?.mechanicCode ?? null);

  return (
    <>
      <svg className="map-layer map-layer--svg" viewBox="0 0 4096 2048" aria-hidden="true">
        <defs>
          <linearGradient id="routeLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c9a15c" />
            <stop offset="22%" stopColor="#c8f25a" />
            <stop offset="100%" stopColor="#8fd0f0" />
          </linearGradient>
        </defs>
        <path d={PATH_D} fill="none" stroke="#0a1720" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        <path
          d={PATH_D}
          fill="none"
          stroke="url(#routeLine)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1 22"
          opacity="0.85"
        />
      </svg>

      <div className="map-layer map-layer--markers">
        {cells.map((cell) => {
          const point = cellPoint(cell.idx);
          const polarity = polarityOf(cell.mechanicCode);
          const isCurrent = players.some((p) => p.position === cell.idx && p.isMe);
          return (
            <button
              key={cell.idx}
              type="button"
              className="cell"
              data-kind={cell.kind}
              data-polarity={polarity}
              data-current={isCurrent}
              data-passed={cell.idx < (players.find((p) => p.isMe)?.position ?? 1)}
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              aria-label={`Клетка ${cell.idx}${
                cell.kind === 'event' ? `, ${mechanic(cell.mechanicCode)?.name ?? 'событие'}` : ''
              }`}
              onMouseEnter={() => setHovered(cell.idx)}
              onMouseLeave={() => setHovered((current) => (current === cell.idx ? null : current))}
              onFocus={() => setHovered(cell.idx)}
              onBlur={() => setHovered((current) => (current === cell.idx ? null : current))}
              onClick={() => setHovered(cell.idx)}
            >
              {cell.kind === 'finish' ? '★' : cell.idx}
            </button>
          );
        })}
      </div>

      {hoveredCell && hoveredPoint && (
        <div
          className="cell-tip"
          style={{ left: `${hoveredPoint.x * 100}%`, top: `${hoveredPoint.y * 100}%` }}
          role="tooltip"
        >
          <div className="cell-tip__num">{hoveredCell.idx}</div>
          <span className={`chip cell-tip__badge ${badgeClass(hoveredMechanic?.polarity)}`}>
            {hoveredMechanic ? POLARITY_LABEL[hoveredMechanic.polarity] : 'Обычная клетка'}
          </span>
          <p className="cell-tip__name">
            {hoveredCell.kind === 'start'
              ? 'Старт'
              : hoveredCell.kind === 'finish'
                ? 'Финиш'
                : hoveredMechanic?.name ?? 'Без событий'}
          </p>
          <p className="cell-tip__text">
            {hoveredCell.kind === 'start'
              ? 'Отсюда все начинают сезон.'
              : hoveredCell.kind === 'finish'
                ? 'Кубок. Первый дошедший забирает сезон по дистанции.'
                : hoveredMechanic?.tagline ?? 'Просто шаг вперёд.'}
          </p>
        </div>
      )}

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
    </>
  );
}

function badgeClass(polarity: string | undefined): string {
  switch (polarity) {
    case 'positive':
      return 'chip--positive';
    case 'negative':
      return 'chip--negative';
    case 'trap':
      return 'chip--trap';
    case 'neutral':
      return 'chip--info';
    default:
      return 'chip--muted';
  }
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
