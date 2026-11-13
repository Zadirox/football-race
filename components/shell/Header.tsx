'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { play } from '@/lib/audio';
import { signOutAction } from '@/lib/auth/actions';
import type { MeView } from '@/lib/types';

type HeaderProps = {
  me: MeView | null;
  /** Конец игрового дня по МСК; null — день ещё не собран. */
  closesAt: string | null;
  demo: boolean;
};

type Tab = { href: string; label: string; icon: string; adminOnly?: boolean };

const LEFT_TABS: Tab[] = [
  { href: '/effects', label: 'Эффекты', icon: '◈' },
  { href: '/rules', label: 'Правила', icon: '☰' },
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
  if (diff <= 0) return 'приём ответов закрыт';
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `до конца приёма: ${days} д ${pad(hours)}:${pad(minutes)}`;
  return `до конца приёма: ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function Header({ me, closesAt, demo }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(remainingLabel(closesAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [closesAt]);

  const tabs = useMemo(
    () => RIGHT_TABS.filter((tab) => !tab.adminOnly || me?.role === 'admin'),
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
    return (
      <Link
        key={item.href}
        href={active ? '/' : item.href}
        prefetch
        className="tab"
        data-active={active}
        aria-current={active ? 'page' : undefined}
        aria-label={active ? `${item.label}: закрыть` : item.label}
        title={active ? 'Закрыть' : item.label}
        onClick={(event) => {
          play('click');
          if (active) {
            event.preventDefault();
            closePanel();
          }
        }}
      >
        <span className="tab__icon" aria-hidden="true">{item.icon}</span>
        <span className="tab__label">{item.label}</span>
      </Link>
    );
  };

  return (
    <header className="topbar">
      <nav className="topbar__left" aria-label="Справка">
        <div className="tabs">{LEFT_TABS.map(tab)}</div>
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
