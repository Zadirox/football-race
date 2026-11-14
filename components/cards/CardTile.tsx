import type { OwnedCardView } from '@/lib/types';

const RARITY_LABEL: Record<OwnedCardView['rarity'], string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legend: 'Legend',
};

const ROLE_LABEL: Record<OwnedCardView['roleGroup'], string> = {
  GK: 'Вратарь',
  DEF: 'Защитник',
  MID: 'Полузащитник',
  FWD: 'Нападающий',
};

type Props = {
  card: OwnedCardView;
  compact?: boolean;
};

export function CardTile({ card, compact }: Props) {
  return (
    <article className={`card-tile card-tile--${card.rarity}${compact ? ' card-tile--compact' : ''}`}>
      <div className="card-tile__top">
        <span className={`chip chip--${card.rarity}`}>{RARITY_LABEL[card.rarity]}</span>
        <span className="card-tile__rating">{card.rating}</span>
      </div>
      <div className="card-tile__photo" aria-hidden="true">
        {card.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photoUrl} alt="" loading="lazy" />
        ) : (
          <div className="card-tile__placeholder">{card.playerName.slice(0, 1).toUpperCase()}</div>
        )}
      </div>
      <h3 className="card-tile__name">{card.playerName}</h3>
      <p className="card-tile__meta">{card.nationalTeam || '—'}</p>
      <p className="card-tile__meta">{ROLE_LABEL[card.roleGroup]}</p>
    </article>
  );
}

export { RARITY_LABEL, ROLE_LABEL };