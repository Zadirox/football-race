'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Notice, SectionTitle } from '@/components/ui/Panel';
import { formatRuShortDateTimeMsk } from '@/lib/format';
import { resolveSyncMatchReviewAction, type AdminRunResult } from '@/lib/actions/admin';
import type { SyncMatchReviewRow } from '@/lib/repo/sync-reviews';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return formatRuShortDateTimeMsk(iso);
}

function statusLabel(status: SyncMatchReviewRow['status']): string {
  if (status === 'pending') return 'ожидает';
  if (status === 'resolved') return 'разобрано';
  return 'пропущено';
}

export function SyncReviewsAdmin({
  enabled,
  reviews,
}: {
  enabled: boolean;
  reviews: SyncMatchReviewRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; result: AdminRunResult } | null>(null);

  const pendingReviews = reviews.filter((r) => r.status === 'pending');
  const recentDone = reviews.filter((r) => r.status !== 'pending').slice(0, 8);

  function run(id: string, status: 'resolved' | 'ignored') {
    setBusyId(id);
    setFeedback(null);
    startTransition(async () => {
      const result = await resolveSyncMatchReviewAction({ reviewId: id, status });
      setFeedback({ id, result });
      setBusyId(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="stack" style={{ marginTop: 24 }}>
      <SectionTitle>Проверка совпадений синка</SectionTitle>
      <p className="muted" style={{ marginTop: 0 }}>
        Сюда попадают матчи, которые синк не привязал автоматически по правилу безопасности: неизвестная команда в списке соответствий или подозрительное совпадение.
        Такие матчи не добавляются в игровой день сами — нужно добавить соответствие команды или разобрать запись вручную.
      </p>

      {!enabled && <Notice tone="warning">Демо-режим: разбор очереди недоступен.</Notice>}

      {pendingReviews.length === 0 ? (
        <Notice tone="info">Очередь проверки пуста.</Notice>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {pendingReviews.map((review) => (
            <div key={review.id} className="card card--soft" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {review.home_name} — {review.away_name}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {review.league_code ?? 'лига?'} · {review.provider}:{review.external_id} · старт {fmt(review.kickoff_utc)}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    Причина: {review.reason}
                  </div>
                  {review.canonical_key_candidate && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Кандидат ключа: {review.canonical_key_candidate}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={!enabled || pending}
                    onClick={() => run(review.id, 'resolved')}
                  >
                    {busyId === review.id && pending ? '...' : 'Разобрано'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={!enabled || pending}
                    onClick={() => run(review.id, 'ignored')}
                  >
                    Пропустить
                  </button>
                </div>
              </div>
              {feedback?.id === review.id && (
                <div style={{ marginTop: 10 }}>
                  <Notice tone={feedback.result.ok ? 'info' : 'danger'}>{feedback.result.message}</Notice>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {recentDone.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>
            Недавно разобранные ({recentDone.length})
          </summary>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {recentDone.map((review) => (
              <div key={review.id} className="card card--soft" style={{ padding: 12, opacity: 0.85 }}>
                <div style={{ fontWeight: 600 }}>
                  {review.home_name} — {review.away_name}{' '}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    · {statusLabel(review.status)}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {review.provider}:{review.external_id} · {fmt(review.resolved_at ?? review.created_at)}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
