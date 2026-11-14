'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Panel, EmptyState } from '@/components/ui/Panel';
import { avatarColor } from '@/components/map/MapBoard';
import { dayResultDieLabel, formatDayAccuracy } from '@/lib/game/day-results';
import { formatAccuracy, type RatingRow } from '@/lib/game/scoring';
import type { ClosedMatchdayOption } from '@/lib/repo/matchday-results';
import type { MatchdayResultView } from '@/lib/types';

type Mode = 'distance' | 'points' | 'accuracy' | 'day';

const TABS: Array<{ key: Mode; label: string }> = [
  { key: 'distance', label: 'Дистанция' },
  { key: 'points', label: 'Очки' },
  { key: 'accuracy', label: 'Точность' },
  { key: 'day', label: 'За день' },
];

function formatGameDate(gameDate: string): string {
  const date = new Date(`${gameDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return gameDate;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="avatar avatar--sm"
      aria-hidden="true"
      style={{ background: `linear-gradient(150deg, ${avatarColor(name, 0)}, ${avatarColor(name, 1)})` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function PlayerCell({ nickname, profileId, meId }: { nickname: string; profileId: string; meId: string | null }) {
  return (
    <div className="player-cell">
      <Avatar name={nickname} />
      <span>{nickname}</span>
      {profileId === meId && <span className="chip chip--positive">ты</span>}
    </div>
  );
}

function SeasonPlayerCell({ row, meId }: { row: RatingRow; meId: string | null }) {
  return <PlayerCell nickname={row.nickname} profileId={row.profileId} meId={meId} />;
}

export function RatingsClient({
  rows,
  meId,
  closedDays,
  selectedDayId,
  dayResults,
}: {
  rows: RatingRow[];
  meId: string | null;
  closedDays: ClosedMatchdayOption[];
  selectedDayId: string | null;
  dayResults: MatchdayResultView[];
}) {
  const [mode, setMode] = useState<Mode>('distance');

  const byDistance = rows;
  const byPoints = [...rows].sort((a, b) => a.pointsRank - b.pointsRank);
  const byAccuracy = [...rows].sort((a, b) => {
    if (a.accuracyRank === null && b.accuracyRank === null) return b.answered - a.answered;
    if (a.accuracyRank === null) return 1;
    if (b.accuracyRank === null) return -1;
    return a.accuracyRank - b.accuracyRank;
  });

  const list = mode === 'distance' ? byDistance : mode === 'points' ? byPoints : byAccuracy;

  return (
    <Panel
      title="Рейтинги"
      subtitle="Три зачёта сезона и итоги по каждому закрытому игровому дню. Дистанция решает путь к кубку, очки — за события и предикты, точность — доля верных ответов."
      size="wide"
    >
      <div className="tabs-lite" role="tablist" aria-label="Вид рейтинга">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={mode === tab.key}
            data-active={mode === tab.key}
            onClick={() => setMode(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'day' ? (
        <DayResultsView
          closedDays={closedDays}
          selectedDayId={selectedDayId}
          dayResults={dayResults}
          meId={meId}
        />
      ) : list.length === 0 ? (
        <EmptyState title="Пока пусто" text="Рейтинг появится, как только участники сделают первые броски и ответят на вопросы." />
      ) : (
        <table className="table table--cards">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Участник</th>
              {mode === 'distance' && (
                <>
                  <th>Клетка</th>
                  <th>Финиш</th>
                </>
              )}
              {mode === 'points' && (
                <>
                  <th>Очки</th>
                  <th>Клетка</th>
                </>
              )}
              {mode === 'accuracy' && (
                <>
                  <th>Точность</th>
                  <th>Верно</th>
                  <th>Ответов</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {list.map((row, index) => {
              const rank =
                mode === 'distance' ? row.distanceRank : mode === 'points' ? row.pointsRank : row.accuracyRank;
              const low = mode === 'accuracy' && row.lowData;
              return (
                <tr key={row.profileId} data-me={row.profileId === meId} data-low={low}>
                  <td className="rank" data-top={rank ?? undefined}>
                    {mode === 'accuracy' && low ? '—' : `#${index + 1}`}
                  </td>
                  <td data-label="Участник">
                    <div className="table-value table-value--stack">
                      <SeasonPlayerCell row={row} meId={meId} />
                      {low && <span className="card__meta">мало ответов для зачёта</span>}
                    </div>
                  </td>
                  {mode === 'distance' && (
                    <>
                      <td data-label="Клетка">
                        <span className="table-value">
                          <strong>{row.position}</strong> / 80
                        </span>
                      </td>
                      <td className="card__meta" data-label="Финиш">
                        {row.finishedAt
                          ? new Date(row.finishedAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })
                          : 'в пути'}
                      </td>
                    </>
                  )}
                  {mode === 'points' && (
                    <>
                      <td data-label="Очки">
                        <strong>{row.points}</strong>
                      </td>
                      <td data-label="Клетка">{row.position}</td>
                    </>
                  )}
                  {mode === 'accuracy' && (
                    <>
                      <td data-label="Точность">
                        <strong>{formatAccuracy(row.accuracy)}</strong>
                      </td>
                      <td data-label="Верно">{row.correct}</td>
                      <td data-label="Ответов">{row.answered}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function DayResultsView({
  closedDays,
  selectedDayId,
  dayResults,
  meId,
}: {
  closedDays: ClosedMatchdayOption[];
  selectedDayId: string | null;
  dayResults: MatchdayResultView[];
  meId: string | null;
}) {
  if (closedDays.length === 0) {
    return <EmptyState title="Пока нет закрытых дней" text="Итоги по дню появятся после того, как первый игровой день будет подведён." />;
  }

  return (
    <>
      <div className="filters" role="group" aria-label="Выбор игрового дня" style={{ marginBottom: 16 }}>
        {closedDays.map((day) => (
          <Link
            key={day.id}
            href={`/ratings?day=${encodeURIComponent(day.id)}`}
            className="filter"
            data-active={day.id === selectedDayId}
          >
            {formatGameDate(day.gameDate)}
          </Link>
        ))}
      </div>

      {dayResults.length === 0 ? (
        <EmptyState title="Нет данных за этот день" text="Для выбранного дня пока нет результатов." />
      ) : (
        <table className="table table--cards">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Участник</th>
              <th>Верно</th>
              <th>Всего</th>
              <th>Точность</th>
              <th>Кубик за день</th>
            </tr>
          </thead>
          <tbody>
            {dayResults.map((row, index) => (
              <tr key={row.profileId} data-me={row.profileId === meId}>
                <td className="rank" data-top={row.rank && row.rank <= 3 ? row.rank : undefined}>
                  {row.rank ? `#${row.rank}` : `#${index + 1}`}
                </td>
                <td data-label="Участник">
                  <PlayerCell nickname={row.nickname} profileId={row.profileId} meId={meId} />
                </td>
                <td data-label="Верно">
                  <strong>{row.correct}</strong>
                </td>
                <td data-label="Всего">{row.total}</td>
                <td data-label="Точность">{formatDayAccuracy(row.correct, row.total)}</td>
                <td data-label="Кубик за день">
                  {dayResultDieLabel(row.dieTier) ?? '—'}
                  {row.bonusHit ? ' (+бонус)' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
