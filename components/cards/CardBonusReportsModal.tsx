'use client';

import { useEffect } from 'react';
import type { AdminCardBonusBatchResultView, CardBonusReportView } from '@/lib/types';

type AdminSummaryProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  summary: AdminCardBonusBatchResultView | null;
};

type PlayerHistoryProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  reports: CardBonusReportView[];
  loading?: boolean;
};

function fmtKickoff(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
}

export function CardBonusAdminSummaryModal({ open, onClose, title, summary }: AdminSummaryProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || !summary) return null;
  const awarded = summary.items.filter((i) => i.awarded);
  const noPoints = summary.items.filter((i) => !i.awarded);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(920px, 100%)', maxHeight: '85vh', overflow: 'auto' }}>
        <div className="modal__eyebrow">Результат отправки</div>
        <h2 className="modal__title" style={{ marginBottom: 8 }}>{title}</h2>
        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="stat"><div className="stat__label">Игроков</div><div className="stat__value">{summary.playersAffected}</div></div>
          <div className="stat"><div className="stat__label">Начислено карточек</div><div className="stat__value stat__value--lime">{summary.awardedCount}</div></div>
          <div className="stat"><div className="stat__label">Без очков</div><div className="stat__value">{summary.noPointsCount}</div></div>
          <div className="stat"><div className="stat__label">Очков всего</div><div className="stat__value stat__value--lime">+{summary.totalPointsAwarded}</div></div>
        </div>

        {awarded.length > 0 && (
          <>
            <h3 className="card__title" style={{ marginBottom: 8 }}>Начислено</h3>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {awarded.map((item) => (
                <div key={item.lineupSlotId} className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  {item.cardPhotoUrl ? <img src={item.cardPhotoUrl} alt="" style={{ width: 56, height: 74, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ width: 56, height: 74, borderRadius: 8, background: 'rgba(255,255,255,.08)' }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>{item.cardName} {item.cardTeamName ? `(${item.cardTeamName})` : ''}</div>
                    <div className="card__meta">{item.slot} · {item.roleGroup} · {item.rarity} · {item.rating}</div>
                    <div className="card__meta">{item.homeTeamName} — {item.awayTeamName} · {fmtKickoff(item.kickoffAt)} МСК</div>
                  </div>
                  <div className="chip chip--positive">+{item.points}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {noPoints.length > 0 && (
          <>
            <h3 className="card__title" style={{ marginBottom: 8 }}>Без очков</h3>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {noPoints.map((item) => (
                <div key={item.lineupSlotId} className="list-row">
                  <span className="list-row__main">
                    <span className="list-row__title">{item.cardName} {item.cardTeamName ? `(${item.cardTeamName})` : ''}</span>
                    <span className="list-row__meta">{item.homeTeamName} — {item.awayTeamName} · {fmtKickoff(item.kickoffAt)} МСК</span>
                  </span>
                  <span className="chip chip--muted">0 оч.</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal__actions"><button type="button" className="btn btn--primary" onClick={onClose}>Закрыть</button></div>
      </div>
    </div>
  );
}

export function CardBonusPlayerHistoryModal({ open, onClose, title, reports, loading }: PlayerHistoryProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(920px, 100%)', maxHeight: '85vh', overflow: 'auto' }}>
        <div className="modal__eyebrow">Карточки</div>
        <h2 className="modal__title" style={{ marginBottom: 8 }}>{title}</h2>
        {loading ? <p className="card__text">Загружаем…</p> : reports.length === 0 ? <p className="card__text">Пока нет начислений за карточки.</p> : (
          <div style={{ display: 'grid', gap: 14 }}>
            {reports.map((report) => (
              <section key={report.reportId} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div className="card__meta">{new Date(report.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} МСК</div>
                  <div className="chip chip--positive">+{report.totalPoints} за {report.awardedCount} карточ.</div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {report.items.map((item) => (
                    <div key={`${report.reportId}:${item.lineupSlotId}:${item.matchId}`} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {item.cardPhotoUrl ? <img src={item.cardPhotoUrl} alt="" style={{ width: 52, height: 68, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ width: 52, height: 68, borderRadius: 8, background: 'rgba(255,255,255,.08)' }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{item.cardName} {item.cardTeamName ? `(${item.cardTeamName})` : ''}</div>
                        <div className="card__meta">{item.homeTeamName} — {item.awayTeamName} · {fmtKickoff(item.kickoffAt)} МСК</div>
                        <div className="card__meta">{item.slot} · {item.roleGroup} · {item.rarity} · {item.rating}</div>
                      </div>
                      <div className="chip chip--positive">+{item.points}</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <div className="modal__actions" style={{ marginTop: 16 }}><button type="button" className="btn btn--primary" onClick={onClose}>Закрыть</button></div>
      </div>
    </div>
  );
}
