'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OwnedCardView } from '@/lib/types';
import { RARITY_LABEL, ROLE_LABEL } from './CardTile';

type Step = 0 | 1 | 2 | 3 | 4;

type Props = {
  card: OwnedCardView | null;
  collectionComplete?: boolean;
  onClose: () => void;
};

const STEP_DELAY_MS = 900;

/**
 * Последовательность раскрытия: страна → роль/позиция → рейтинг → игрок.
 * Базовая ступенчатая анимация/показ, готовая к усилению 3D/FX/звуком.
 */
export function PackOpenReveal({ card, collectionComplete, onClose }: Props) {
  const [step, setStep] = useState<Step>(0);

  useEffect(() => {
    if (!card) {
      setStep(4);
      return;
    }
    setStep(0);
    const timers = [
      window.setTimeout(() => setStep(1), STEP_DELAY_MS),
      window.setTimeout(() => setStep(2), STEP_DELAY_MS * 2),
      window.setTimeout(() => setStep(3), STEP_DELAY_MS * 3),
      window.setTimeout(() => setStep(4), STEP_DELAY_MS * 4),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [card]);

  const rarityLabel = useMemo(() => (card ? RARITY_LABEL[card.rarity] : null), [card]);

  return (
    <div className="pack-reveal" role="dialog" aria-modal="true" aria-label="Открытие пака">
      <div className="pack-reveal__backdrop" onClick={onClose} />
      <div className={`pack-reveal__card${card ? ` pack-reveal__card--${card.rarity}` : ''}`}>
        {collectionComplete || !card ? (
          <div className="pack-reveal__done">
            <h2 className="card__title">Коллекция собрана</h2>
            <p className="card__text">Новых карточек в этом сете больше нет. Дублей не выдаём.</p>
          </div>
        ) : (
          <>
            <div className="pack-reveal__steps" aria-live="polite">
              <div className={`reveal-step${step >= 1 ? ' reveal-step--show' : ''}`}>
                <div className="reveal-step__label">Сборная</div>
                <div className="reveal-step__value">{card.nationalTeam || '—'}</div>
              </div>
              <div className={`reveal-step${step >= 2 ? ' reveal-step--show' : ''}`}>
                <div className="reveal-step__label">Роль / позиция</div>
                <div className="reveal-step__value">{ROLE_LABEL[card.roleGroup]}</div>
              </div>
              <div className={`reveal-step${step >= 3 ? ' reveal-step--show' : ''}`}>
                <div className="reveal-step__label">Рейтинг</div>
                <div className="reveal-step__value reveal-step__value--big">{card.rating}</div>
              </div>
              <div className={`reveal-step${step >= 4 ? ' reveal-step--show' : ''}`}>
                <div className="reveal-step__label">Игрок</div>
                <div className="reveal-step__value">{card.playerName}</div>
                <div className="reveal-step__sub">{rarityLabel}</div>
              </div>
            </div>

            <div className={`pack-reveal__portrait${step >= 4 ? ' pack-reveal__portrait--show' : ''}`}>
              {card.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.photoUrl} alt={card.playerName} />
              ) : (
                <div className="pack-reveal__placeholder">{card.playerName.slice(0, 1).toUpperCase()}</div>
              )}
            </div>
          </>
        )}

        <button type="button" className="btn btn--primary" onClick={onClose} style={{ marginTop: 16 }}>
          {step >= 4 || collectionComplete || !card ? 'В коллекцию' : 'Пропустить'}
        </button>
      </div>

      <style jsx>{`
        .pack-reveal {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .pack-reveal__backdrop {
          position: absolute;
          inset: 0;
          background: rgba(7, 12, 20, 0.78);
          backdrop-filter: blur(4px);
        }
        .pack-reveal__card {
          position: relative;
          width: min(520px, 100%);
          border-radius: 16px;
          padding: 20px;
          background: linear-gradient(180deg, rgba(28, 36, 52, 0.98), rgba(14, 20, 30, 0.98));
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
          text-align: center;
        }
        .pack-reveal__card--legend { border-color: rgba(255, 214, 102, 0.55); box-shadow: 0 0 0 1px rgba(255,214,102,0.15), 0 20px 60px rgba(0,0,0,0.45); }
        .pack-reveal__card--epic { border-color: rgba(190, 140, 255, 0.55); }
        .pack-reveal__card--rare { border-color: rgba(120, 190, 255, 0.5); }
        .pack-reveal__steps { display: grid; gap: 10px; margin-bottom: 14px; }
        .reveal-step { opacity: 0; transform: translateY(8px) scale(0.98); transition: opacity .35s ease, transform .35s ease; min-height: 22px; }
        .reveal-step--show { opacity: 1; transform: translateY(0) scale(1); }
        .reveal-step__label { font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: .04em; }
        .reveal-step__value { font-size: 20px; font-weight: 700; }
        .reveal-step__value--big { font-size: 34px; }
        .reveal-step__sub { font-size: 13px; opacity: 0.85; margin-top: 2px; }
        .pack-reveal__portrait { width: 140px; height: 140px; margin: 8px auto 0; border-radius: 14px; overflow: hidden; background: rgba(255,255,255,0.06); opacity: 0; transform: scale(0.92); transition: opacity .35s ease .05s, transform .35s ease .05s; display:flex; align-items:center; justify-content:center; }
        .pack-reveal__portrait--show { opacity: 1; transform: scale(1); }
        .pack-reveal__portrait img { width: 100%; height: 100%; object-fit: cover; }
        .pack-reveal__placeholder { font-size: 48px; font-weight: 700; opacity: .8; }
        .pack-reveal__done { padding: 12px 0 4px; }
      `}</style>
    </div>
  );
}