'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { openPackAction } from '@/lib/actions/cards';
import { CardTile } from '@/components/cards/CardTile';
import { PackOpenReveal } from '@/components/cards/PackOpenReveal';
import { Notice } from '@/components/ui/Panel';
import type { OwnedCardView, PackGrantView, PackOpenResultView } from '@/lib/types';

type Props = {
  packs: PackGrantView[];
  cards: OwnedCardView[];
};

const RARITY_ORDER: Record<OwnedCardView['rarity'], number> = {
  legend: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

export function CollectionClient({ packs, cards }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<PackOpenResultView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      const r = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (r !== 0) return r;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.playerName.localeCompare(b.playerName, 'ru');
    });
  }, [cards]);

  const open = (grantId: string) => {
    if (pending) return;
    setError(null);
    setOpeningId(grantId);
    startTransition(async () => {
      const res = await openPackAction(grantId);
      setOpeningId(null);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setReveal(res.result);
      router.refresh();
    });
  };

  return (
    <div className="collection">
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <section className="card" style={{ marginBottom: 18 }}>
        <h2 className="card__title">Паки</h2>
        <p className="card__meta">Невскрытые паки «Сборные». В каждом — 1 карточка, без дублей.</p>
        {packs.length === 0 ? (
          <p className="card__text">Невскрытых паков нет. Пак можно получить за игровой день, на клетке «Пак на выбор» или от админа.</p>
        ) : (
          <div className="list">
            {packs.map((pack) => (
              <div key={pack.id} className="list-row">
                <span className="chip chip--info">Пак</span>
                <span className="list-row__main">
                  <span className="list-row__title">{pack.packTitle}</span>
                  <span className="list-row__meta">Источник: {pack.source === 'admin' ? 'админ' : pack.source === 'matchday' ? 'игровой день' : 'клетка'}</span>
                </span>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={pending}
                  onClick={() => open(pack.id)}
                >
                  {pending && openingId === pack.id ? 'Открываем…' : 'Открыть'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="card__title" style={{ marginBottom: 8 }}>Карточки</h2>
        <p className="card__meta" style={{ marginBottom: 12 }}>
          {sortedCards.length ? `В коллекции: ${sortedCards.length}` : 'Коллекция пока пуста — откройте пак, чтобы получить первую карточку.'}
        </p>
        {sortedCards.length > 0 && (
          <div className="cards-grid">
            {sortedCards.map((card) => (
              <CardTile key={card.instanceId} card={card} />
            ))}
          </div>
        )}
      </section>

      {reveal && (
        <PackOpenReveal
          card={reveal.card}
          collectionComplete={reveal.collectionComplete}
          onClose={() => setReveal(null)}
        />
      )}

      <style jsx>{`
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }
        :global(.card-tile) {
          border-radius: 14px;
          padding: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          text-align: center;
        }
        :global(.card-tile--legend) { border-color: rgba(255,214,102,0.45); }
        :global(.card-tile--epic) { border-color: rgba(190,140,255,0.45); }
        :global(.card-tile--rare) { border-color: rgba(120,190,255,0.4); }
        :global(.card-tile__top) { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        :global(.card-tile__rating) { font-weight: 800; font-size: 18px; }
        :global(.card-tile__photo) { width: 72px; height: 72px; margin: 0 auto 8px; border-radius: 12px; overflow:hidden; background: rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; }
        :global(.card-tile__photo img) { width:100%; height:100%; object-fit:cover; }
        :global(.card-tile__placeholder) { font-size: 28px; font-weight: 700; opacity: .8; }
        :global(.card-tile__name) { font-size: 14px; margin: 0 0 4px; }
        :global(.card-tile__meta) { font-size: 12px; opacity: .8; margin: 0; }
        :global(.chip--legend) { background: rgba(255,214,102,0.18); color: #ffe08a; }
        :global(.chip--epic) { background: rgba(190,140,255,0.18); color: #e0c2ff; }
        :global(.chip--rare) { background: rgba(120,190,255,0.18); color: #bfe4ff; }
        :global(.chip--common) { background: rgba(255,255,255,0.1); color: #e6edf5; }
      `}</style>
    </div>
  );
}