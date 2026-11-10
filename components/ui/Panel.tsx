import type { ReactNode } from 'react';

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
};

export function Panel({ title, subtitle, actions, children, size = 'default' }: PanelProps) {
  const sizeClass = size === 'wide' ? 'panel--wide' : size === 'narrow' ? 'panel--narrow' : '';
  return (
    <div className="panel-holder page-enter">
      <section className={`panel ${sizeClass}`.trim()} aria-label={title}>
        <header className="panel__head">
          <div>
            <h1 className="panel__title">{title}</h1>
            {subtitle && <p className="panel__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="panel__head-actions">{actions}</div>}
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

export function Notice({ children, tone = 'warning' }: { children: ReactNode; tone?: 'warning' | 'info' }) {
  return <div className={`notice ${tone === 'info' ? 'notice--info' : ''}`.trim()}>{children}</div>;
}
