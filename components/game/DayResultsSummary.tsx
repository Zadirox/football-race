'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { dayResultDieLabel, dayResultsSeenKey, formatDayAccuracy, shouldShowDaySummary } from '@/lib/game/day-results';
import type { SeasonSnapshot } from '@/lib/types';

function formatDayDate(gameDate: string): string {
  const date = new Date(`${gameDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return gameDate;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
}

export function DayResultsSummary({ snapshot }: { snapshot: SeasonSnapshot }) {
  const result = snapshot.myLastClosedDayResult;
  const me = snapshot.me;
  const canSee = Boolean(me?.isPlayer && result);
  const storageKey = useMemo(() => {
    if (!me || !snapshot.season?.id) return null;
    return dayResultsSeenKey(snapshot.season.id, me.profileId);
  }, [me, snapshot.season?.id]);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!canSee || !result || !storageKey) return;
    try {
      const dismissed = window.localStorage.getItem(storageKey);
      setOpen(shouldShowDaySummary(result.matchdayId, dismissed));
    } catch {
      setOpen(true);
    }
  }, [canSee, result, storageKey]);

  if (!open || !result || !canSee) return null;

  const close = () => {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, result.matchdayId);
      } catch {
        // ignore
      }
    }
    setOpen(false);
  };

  const dieLabel = dayResultDieLabel(result.dieTier);
  const leader = snapshot.lastClosedDayTop[0] ?? null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Итоги игрового дня" onClick={close}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} style={{ width: 'min(520px, 100%)' }}>
        <div className="modal__eyebrow">Игровой день завершён</div>
        <h2 className="modal__title" style={{ marginBottom: 8 }}>
          Итоги дня — {formatDayDate(result.gameDate)}
        </h2>
        <p className="modal__text" style={{ marginBottom: 16 }}>
          Ответы проверены. Вот как прошёл день для тебя.
        </p>

        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="stat__label">Угадано</div>
            <div className="stat__value stat__value--lime">
              {result.correct} / {result.total}
            </div>
            <div className="card__meta">точность {formatDayAccuracy(result.correct, result.total)}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Кубик за день</div>
            <div className="stat__value" style={{ fontSize: 16 }}>
              {dieLabel ?? 'не выдан'}
            </div>
            <div className="card__meta">
              {result.bonusHit ? 'бонус за точный счёт: да' : 'бонус за точный счёт: нет'}
            </div>
          </div>
        </div>

        {leader && (
          <p className="modal__text" style={{ marginBottom: 16 }}>
            Лидер дня: <strong>{leader.nickname}</strong> — {leader.correct} из {leader.total}.
          </p>
        )}

        <div className="modal__actions" style={{ flexWrap: 'wrap' }}>
          <Link href="/predictions" className="btn" onClick={close}>
            К предиктам
          </Link>
          <Link href="/ratings" className="btn" onClick={close}>
            К рейтингам
          </Link>
          <button type="button" className="btn btn--primary" onClick={close}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
