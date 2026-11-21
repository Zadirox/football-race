'use client';

import { useState } from 'react';
import type { OwnedCardView } from '@/lib/types';
import { RARITY_LABEL_RU, ROLE_LABEL_RU, teamFlag } from '@/lib/game/cards-ui';
import styles from './fut-card.module.css';

export type FutCardVariant = 'fut' | 'premium';
export type FutCardPalette = 'fut' | 'lux';
export type FutCardSize = 'sm' | 'md' | 'lg';

type Props = {
  card: OwnedCardView;
  variant?: FutCardVariant;
  palette?: FutCardPalette;
  size?: FutCardSize;
  interactive?: boolean;
  className?: string;
};

const RARITY_CLASS: Record<OwnedCardView['rarity'], string> = {
  common: styles.rarityCommon ?? '',
  rare: styles.rarityRare ?? '',
  epic: styles.rarityEpic ?? '',
  legend: styles.rarityLegend ?? '',
};

const VARIANT_CLASS: Record<FutCardVariant, string> = {
  fut: styles.variantFut ?? '',
  premium: styles.variantPremium ?? '',
};

const PALETTE_CLASS: Record<FutCardPalette, string> = {
  fut: styles.palFut ?? '',
  lux: styles.palLux ?? '',
};

const SIZE_CLASS: Record<FutCardSize, string> = {
  sm: styles.sizeSm ?? '',
  md: '',
  lg: styles.sizeLg ?? '',
};

export function FutCard({
  card,
  variant = 'fut',
  palette = 'fut',
  size = 'md',
  interactive = true,
  className,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const [portraitRatio, setPortraitRatio] = useState<'tall' | 'square'>('tall');
  const isClub = card.setKind === 'club';
  const team = isClub
    ? (card.clubName || card.nationalTeam || 'Клуб')
    : (card.nationalTeam || 'Сборная');
  const flag = isClub ? null : teamFlag(card.nationalTeam, card.nationalTeamSlug);
  const pos = ROLE_LABEL_RU[card.roleGroup] ?? card.roleGroup;
  const rarityLabel = RARITY_LABEL_RU[card.rarity];;

  const toggleFlip = () => {
    if (interactive) setFlipped((v) => !v);
  };

  return (
    <article
      className={[
        styles.card,
        VARIANT_CLASS[variant],
        PALETTE_CLASS[palette],
        RARITY_CLASS[card.rarity],
        SIZE_CLASS[size],
        interactive ? styles.interactive : '',
        flipped ? styles.flipped : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${card.playerName}, ${team}, ${rarityLabel}, рейтинг ${card.rating}`}
      onClick={toggleFlip}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFlip();
        }
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className={styles.flipWrap}>
        <div className={styles.inner}>
          <div className={styles.texture} aria-hidden="true" />
          <div className={styles.glowOrb} aria-hidden="true" />
          <div className={styles.shine} aria-hidden="true" />
          <div className={styles.frame} aria-hidden="true" />
          <div className={styles.ornament} aria-hidden="true" />

          <div className={styles.top}>
            <div className={styles.rating}>{card.rating}</div>
            <div className={styles.pos}>{pos}</div>
            <div className={styles.divider} aria-hidden="true" />
            <div className={styles.flag} title={team} aria-label={team}>
              {isClub ? (
                <svg className={styles.clubMark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z" fill="currentColor" opacity="0.22" />
                  <path d="M12 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M8.2 12.1l2.4 2.5 5.2-5.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : flag}
            </div>
          </div>

          <div className={styles.portraitWrap}>
            {card.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.portrait}
                src={card.photoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                data-ratio={portraitRatio}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setPortraitRatio(img.naturalHeight / img.naturalWidth < 1.2 ? 'square' : 'tall');
                  }
                }}
              />
            ) : (
              <div className={styles.portraitPlaceholder} aria-hidden="true" />
            )}
          </div>

          <div className={styles.bottom}>
            <div className={styles.name} title={card.playerName}>{card.playerName}</div>
            <div className={styles.meta} title={`${team} · ${rarityLabel}`}>
              <span className={styles.teamName}>{team}</span>
              <span className={styles.metaSep} aria-hidden="true"> · </span>
              <span className={styles.rarityText}>{rarityLabel}</span>
            </div>
          </div>
        </div>

        <div className={styles.back} aria-hidden="true">
          <div className={styles.backPattern} />
          <div className={styles.backGlow} />
          <div className={styles.backFrame} />
          <div className={styles.backCenter}>
            <div className={styles.backEmblem}>FR</div>
            <div className={styles.backTitle}>FOOTBALL RACE</div>
            <div className={styles.backSub}>{rarityLabel}</div>
            <div className={styles.backTeam}>{team}</div>
            <div className={styles.backOvr}>{card.rating}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
