'use client';

import { useEffect, useRef, useState } from 'react';
import { stepSequence, walkDelay, STEP_MS } from '@/lib/game/walk';
import type { PlayerView } from '@/lib/types';

/**
 * Пошаговая ходьба поверх снимка (docs/03 §7).
 *
 * Сервер двигает позицию сразу, а здесь она догоняется шагами по одной
 * клетке. Наружу отдаётся `displayed` — те же игроки с промежуточными
 * позициями, и `walking` — по кому ещё идёт анимация.
 */

export type WalkStepEvent = { profileId: string; cell: number; last: boolean };

export type UsePlayerWalkOptions = {
  msPerCell?: number;
  onStep?: (event: WalkStepEvent) => void;
};

export type PlayerWalk = {
  displayed: PlayerView[];
  walking: Record<string, boolean>;
};

export function usePlayerWalk(players: PlayerView[], options: UsePlayerWalkOptions = {}): PlayerWalk {
  const { msPerCell = STEP_MS, onStep } = options;
  const [positions, setPositions] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((player) => [player.profileId, player.position])),
  );
  const [walking, setWalking] = useState<Record<string, boolean>>({});

  const positionsRef = useRef(positions);
  const targetsRef = useRef(new Map(players.map((player) => [player.profileId, player.position])));
  const timersRef = useRef(new Map<string, number[]>());
  const onStepRef = useRef(onStep);

  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  useEffect(() => {
    const timers = timersRef.current;

    for (const player of players) {
      const id = player.profileId;
      const target = player.position;
      const current = positionsRef.current[id] ?? target;

      if (current === target) {
        targetsRef.current.set(id, target);
        continue;
      }

      // Уже идём к этой же цели — второй прогон эффекта (StrictMode) не нужен.
      if (targetsRef.current.get(id) === target) continue;
      targetsRef.current.set(id, target);

      const previous = timers.get(id);
      if (previous) {
        previous.forEach((timer) => window.clearTimeout(timer));
        timers.delete(id);
      }

      const steps = stepSequence(current, target);
      if (steps.length === 0) continue;

      setWalking((state) => ({ ...state, [id]: true }));

      const created = steps.map((cell, index) => {
        const last = index === steps.length - 1;
        return window.setTimeout(() => {
          positionsRef.current = { ...positionsRef.current, [id]: cell };
          setPositions(positionsRef.current);
          onStepRef.current?.({ profileId: id, cell, last });
          if (last) {
            timers.delete(id);
            setWalking((state) => ({ ...state, [id]: false }));
          }
        }, walkDelay(index + 1, msPerCell));
      });

      timers.set(id, created);
    }
  }, [players, msPerCell]);

  useEffect(
    () => () => {
      timersRef.current.forEach((list) => list.forEach((timer) => window.clearTimeout(timer)));
      timersRef.current.clear();
      targetsRef.current.clear();
    },
    [],
  );

  return {
    displayed: players.map((player) => ({
      ...player,
      position: positions[player.profileId] ?? player.position,
    })),
    walking,
  };
}
