'use client';

import { useState } from 'react';
import { Panel, EmptyState } from '@/components/ui/Panel';
import { avatarColor } from '@/components/map/MapBoard';
import { formatAccuracy, type RatingRow } from '@/lib/game/scoring';

type Mode = 'distance' | 'points' | 'accuracy';

const TABS: Array<{ key: Mode; label: string }> = [
  { key: 'distance', label: 'Дистанция' },
  { key: 'points', label: 'Очки' },
  { key: 'accuracy', label: 'Точность' },
];

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

function PlayerCell({ row, meId }: { row: RatingRow; meId: string | null }) {
  return (
    <div className="player-cell">
      <Avatar name={row.nickname} />
      <span>{row.nickname}</span>
      {row.profileId === meId && <span className="chip chip--positive">ты</span>}
    </div>
  );
}

export function RatingsClient({ rows, meId }: { rows: RatingRow[]; meId: string | null }) {
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
      subtitle="Три зачёта сезона. Дистанция решает, кто первым дойдёт до кубка; очки считаются за события и предикты; точность — доля верных ответов."
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

      {list.length === 0 ? (
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
                      <PlayerCell row={row} meId={meId} />
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
