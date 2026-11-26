'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyCardBonusReportsStateAction, markMyCardBonusReportsSeenAction } from '@/lib/actions/card-bonus-reports';
import type { CardBonusReportView } from '@/lib/types';
import { CardBonusPlayerHistoryModal } from './CardBonusReportsModal';

type Props = {
  enabled: boolean;
  isLoggedIn: boolean;
};

export function CardBonusReportsBadge({ enabled, isLoggedIn }: Props) {
  const [reports, setReports] = useState<CardBonusReportView[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const autoOpenedRef = useRef(false);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async (opts?: { force?: boolean; allowAutoOpen?: boolean }) => {
    if (!enabled || !isLoggedIn || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const state = await getMyCardBonusReportsStateAction();
      setReports(state.reports);
      setUnseenCount(state.unseenCount);
      if (opts?.allowAutoOpen && !autoOpenedRef.current && state.unseenCount > 0) {
        autoOpenedRef.current = true;
        setOpen(true);
      }
    } catch {
      // keep previous state
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, isLoggedIn]);

  useEffect(() => {
    if (!enabled || !isLoggedIn) {
      setReports([]);
      setUnseenCount(0);
      setOpen(false);
      return;
    }
    void refresh({ force: true, allowAutoOpen: true });
    const onFocus = () => void refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onChanged = () => void refresh({ force: true });
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('cards:bonus-reports-changed', onChanged as EventListener);
    const interval = window.setInterval(() => void refresh(), 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('cards:bonus-reports-changed', onChanged as EventListener);
      window.clearInterval(interval);
    };
  }, [enabled, isLoggedIn, refresh]);

  const close = useCallback(async () => {
    setOpen(false);
    if (unseenCount > 0) {
      const unseenIds = reports.filter((r) => r.items.some((i) => i.isNew) && r.source !== 'historical').map((r) => r.reportId);
      setUnseenCount(0);
      setReports((prev) => prev.map((r) => ({ ...r, items: r.items.map((i) => ({ ...i, isNew: false })) })));
      void markMyCardBonusReportsSeenAction(unseenIds.length > 0 ? unseenIds : undefined);
    }
  }, [reports, unseenCount]);

  const openHistory = useCallback(async () => {
    setLoading(true);
    setOpen(true);
    try {
      await refresh({ force: true });
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  if (!enabled || !isLoggedIn) return null;

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label={unseenCount > 0 ? `Результаты карточек: ${unseenCount} новых` : 'Результаты карточек'}
        title={unseenCount > 0 ? `Результаты карточек: ${unseenCount} новых` : 'Результаты карточек'}
        onClick={() => void openHistory()}
        style={{ position: 'relative' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M14 3v5h5M8 13h8M8 17h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {unseenCount > 0 ? (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--lime, #c8f25a)',
              color: '#111',
              fontSize: 10,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        ) : null}
      </button>
      <CardBonusPlayerHistoryModal
        open={open}
        onClose={() => void close()}
        title={unseenCount > 0 ? 'Новые результаты карточек' : 'История карточек'}
        reports={reports}
        loading={loading}
      />
    </>
  );
}
