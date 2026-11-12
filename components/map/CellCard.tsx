'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlainFlavor } from '@/lib/game/cell-flavor';
import type { CellView } from '@/lib/types';
import { placeCard, type Placement, type Rect } from '@/lib/ui/card-placement';
import { cellCardContent, type CellCardPhase } from '@/lib/ui/cell-card-content';
import { MechanicArt } from './MechanicArt';

/**
 * Карточка клетки — «пропуск на стадион» (docs/03 §6).
 *
 * Рендерится порталом в `document.body`: координаты экранные, поэтому
 * карточка не масштабируется вместе с картой и не обрезается у краёв.
 * Сама карточка не перехватывает мышь — картой можно пользоваться дальше.
 */

type CellCardProps = {
  cell: CellView;
  flavor: PlainFlavor | null;
  anchor: Rect;
  /** Где игрок относительно клетки: на ней, позади или впереди. */
  phase?: CellCardPhase;
};

function stampFor(cell: CellView): string {
  if (cell.kind === 'start') return '→';
  if (cell.kind === 'finish') return '★';
  return '⚽';
}

export function CellCard({ cell, flavor, anchor, phase = 'ahead' }: CellCardProps) {
  const content = useMemo(() => cellCardContent(cell, flavor, phase), [cell, flavor, phase]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useEffect(() => {
    const measure = () => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      setPlacement(
        placeCard(
          anchor,
          { width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchor, cell.idx, content.title, content.line, content.note]);

  const style = placement
    ? { left: placement.left, top: placement.top, opacity: 1 }
    : { left: anchor.left, top: anchor.top, opacity: 0 };

  return createPortal(
    <div
      ref={cardRef}
      id="cell-card"
      className="cell-card"
      data-tone={content.tone}
      data-side={placement?.side ?? 'top'}
      role="tooltip"
      style={style}
    >
      {placement && (
        <span className="cell-card__arrow" aria-hidden="true" style={{ left: placement.arrowX }} />
      )}
      <span className="cell-card__stripe" aria-hidden="true" />
      <div className="cell-card__head">
        <span className="cell-card__num">{cell.kind === 'finish' ? '★' : cell.idx}</span>
        <span className="cell-card__badge">{content.badge}</span>
      </div>
      <div className="cell-card__body">
        <div className="cell-card__content">
          <h3 className="cell-card__title">{content.title}</h3>
          <p className="cell-card__line">{content.line}</p>
          {content.note && <p className="cell-card__note">{content.note}</p>}
        </div>
        <div className="cell-card__hero" aria-hidden="true">
          {content.mechanicCode ? (
            <MechanicArt code={content.mechanicCode} size={96} className="cell-card__hero-art" />
          ) : (
            <span className="cell-card__hero-stamp">{stampFor(cell)}</span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
