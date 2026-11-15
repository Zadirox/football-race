'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { play } from '@/lib/audio';
import { signOutAction } from '@/lib/auth/actions';
import { getUnopenedPacksCountAction } from '@/lib/actions/cards';
import type { MeView } from '@/lib/types';

type HeaderProps = {
  me: MeView | null;
  /** Конец игрового дня по МСК; null — день ещё не собран. */
  closesAt: string | null;
  demo: boolean;
  cardsEnabled?: boolean;
  /** Deprecated: badge count is fetched client-side to avoid layout DB load. */
  unopenedPacks?: number;
};

type Tab = { href: string; label: string; icon: string; adminOnly?: boolean };

const LEFT_TABS: Tab[] = [
  { href: '/effects', label: 'Эффекты', icon: '◈' },
  { href: '/rules', label: 'Правила', icon: '☰' },
  { href: '/collection', label: 'Коллекция', icon: '🃏' },
  { href: '/lineups', label: 'Составы', icon: '▦' },
];

const RIGHT_TABS: Tab[] = [
  { href: '/matches', label: 'Матчи', icon: '⚽' },
  { href: '/predictions', label: 'Предикты', icon: '✎' },
  { href: '/ratings', label: 'Рейтинги', icon: '▲' },
  { href: '/participants', label: 'Участники', icon: '☺' },
  { href: '/admin', label: 'Админка', icon: '⚙', adminOnly: true },
];

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function remainingLabel(closesAt: string | null): string {
  if (!closesAt) return 'игровой день ещё не открыт';
  const diff = Date.parse(closesAt) - Date.now();
  if (Number.isNaN(diff)) return '—';
  if (diff <= 0) return 'игровой день закончился';
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `до конца игрового дня: ${days} д ${pad(hours)}:${pad(minutes)}`;
  return `до конца игрового дня: ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function Header({ me, closesAt, demo, cardsEnabled }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [now, setNow] = useState<string | null>(null);
  const [packNoticeCount, setPackNoticeCount] = useState(0);

  useEffect(() => {
    const tick = () => setNow(remainingLabel(closesAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [closesAt]);

  useEffect(() => {
    if (!cardsEnabled || !me) {
      setPackNoticeCount(0);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let lastFetchAt = 0;
    const minIntervalMs = 15000;

    const refresh = async (force = false) => {
      if (cancelled || inFlight) return;
      const nowMs = Date.now();
      if (!force && nowMs - lastFetchAt < minIntervalMs) return;
      inFlight = true;
      try {
        const count = await getUnopenedPacksCountAction();
        lastFetchAt = Date.now();
        if (!cancelled) setPackNoticeCount(Math.max(0, Number(count) || 0));
      } catch {
        if (!cancelled) setPackNoticeCount(0);
      } finally {
        inFlight = false;
      }
    };

    void refresh(true);
    const onFocus = () => void refresh(false);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(false);
    };
    const onPacksChanged = () => void refresh(true);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('cards:packs-changed', onPacksChanged as EventListener);
    const interval = window.setInterval(() => void refresh(false), 60000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('cards:packs-changed', onPacksChanged as EventListener);
      window.clearInterval(interval);
    };
  }, [cardsEnabled, me?.profileId]);

  const leftTabs = useMemo(
    () =>
      LEFT_TABS.filter((tab) => {
        if (!cardsEnabled && (tab.href === '/collection' || tab.href === '/lineups')) return false;
        return true;
      }),
    [cardsEnabled],
  );

  const tabs = useMemo(
    () =>
      RIGHT_TABS.filter((tab) => {
        if (tab.adminOnly && me?.role !== 'admin') return false;
        return true;
      }),
    [me?.role],
  );

  const closePanel = () => {
    const closeBtn = document.querySelector<HTMLButtonElement>('.panel__close');
    if (closeBtn) {
      closeBtn.click();
      return;
    }
    router.push('/');
  };

  const tab = (item: Tab) => {
    const active = pathname === item.href;
    const unopenedPacks = packNoticeCount;
    const showPackNotice = item.href === '/collection' && cardsEnabled && unopenedPacks > 0;
    return (
      <Link
        key={item.href}
        href={active ? '/' : item.href}
        prefetch
        className="tab"
        data-active={active}
        aria-current={active ? 'page' : undefined}
        aria-label={
          active
            ? `${item.label}: закрыть`
            : showPackNotice
              ? `${item.label}: ${unopenedPacks} неоткрытых паков`
              : item.label
        }
        title={active ? 'Закрыть' : showPackNotice ? `${item.label} · есть неоткрытые паки` : item.label}
        onClick={(event) => {
          play('click');
          if (!active) return;

          event.preventDefault();
          const holder = document.querySelector<HTMLElement>('.panel-holder');
          const closing = holder?.classList.contains('panel-holder--closing');
          // Во время закрытия игнорируем повторные клики, чтобы не спорить с анимацией.
          if (closing) return;

          // Если вкладка активна по адресу, но панель не найдена, открываем её заново.
          if (!holder) {
            router.push(item.href);
            return;
          }
          closePanel();
        }}
      >
        <span className="tab__icon" aria-hidden="true">{item.icon}</span>
        <span className="tab__label">{item.label}</span>
        {showPackNotice ? (
          <span className="tab__pack-notice" aria-hidden="true">
            <span className="tab__pack-notice-dot" />
            <span className="tab__pack-notice-count">{unopenedPacks > 9 ? '9+' : unopenedPacks}</span>
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <header className="topbar">
      <nav className="topbar__left" aria-label="Навигация">
        <div className="tabs">{leftTabs.map(tab)}</div>
      </nav>

      <div className="topbar__center">
        <Link href="/" className="brand" aria-label="На карту сезона">
          <span className="brand__emblem" aria-hidden="true">⚽</span>
          <span className="brand__text">
            <span className="brand__logo">
              <span className="brand__line">ФУТБОЛЬНАЯ</span>
              <span className="brand__line brand__line--accent">ГОНКА</span>
            </span>
            <span className="brand__timer" suppressHydrationWarning>
              {now ?? remainingLabel(closesAt)}
              {demo ? ' · демо' : ''}
            </span>
          </span>
        </Link>
      </div>

      <nav className="topbar__right" aria-label="Разделы">
        <div className="tabs">{tabs.map(tab)}</div>
      </nav>

      <div className="topbar__actions">
        {me ? (
          <Link href="/participants" className="icon-btn icon-btn--profile" title={`${me.nickname} · ${me.role}`} aria-label={`Профиль: ${me.nickname}`}>
            {me.nickname.slice(0, 1).toUpperCase()}
          </Link>
        ) : (
          <Link href="/login" className="btn btn--sm btn--primary">
            Войти
          </Link>
        )}
        {me && !demo && (
          <form action={signOutAction}>
            <button type="submit" className="icon-btn" aria-label="Выйти" title="Выйти">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="m10 5 3 3-3 3M13 8H6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
