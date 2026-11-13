'use client';

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PanelCloseButton } from './PanelCloseButton';

/**
 * Панель поверх карты (docs/05 §1): карта остаётся фоном,
 * контент живёт в тёмной полупрозрачной карточке.
 */

type PanelProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  size?: 'default' | 'wide' | 'narrow';
  /** Панель по высоте контента, а не на весь экран: для коротких состояний. */
  hug?: boolean;
};

export function Panel({ title, subtitle, actions, children, size = 'default', hug = false }: PanelProps) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      router.push('/');
    }, 170);
  }, [router]);

  const sizeClass = size === 'wide' ? 'panel--wide' : size === 'narrow' ? 'panel--narrow' : '';
  const holderClass = `panel-holder page-enter${hug ? ' panel-holder--hug' : ''}${closing ? ' panel-holder--closing' : ''}`;
  return (
    <div className={holderClass}>
      <section className={`panel ${sizeClass}`.trim()} aria-label={title}>
        <header className="panel__head">
          <div>
            <h1 className="panel__title">{title}</h1>
            {subtitle && <p className="panel__subtitle">{subtitle}</p>}
          </div>
          <div className="panel__head-actions">
            {actions}
            <PanelCloseButton onClose={handleClose} />
          </div>
        </header>
        <div className="panel__body">{children}</div>
      </section>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section__title">{children}</h2>;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p className="empty__text">{text}</p>
    </div>
  );
}

export function Notice({
  children,
  tone = 'warning',
}: {
  children: ReactNode;
  tone?: 'warning' | 'info' | 'danger';
}) {
  const toneClass = tone === 'info' ? ' notice--info' : tone === 'danger' ? ' notice--danger' : '';
  return <div className={`notice${toneClass}`}>{children}</div>;
}
