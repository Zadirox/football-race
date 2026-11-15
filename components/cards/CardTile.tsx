import type { OwnedCardView } from '@/lib/types';
import { RARITY_LABEL_RU, ROLE_TITLE_RU } from '@/lib/game/cards-ui';
import { FutCard, type FutCardPalette, type FutCardSize, type FutCardVariant } from './FutCard';

type Props = {
  card: OwnedCardView;
  compact?: boolean;
  size?: FutCardSize;
  variant?: FutCardVariant;
  palette?: FutCardPalette;
  interactive?: boolean;
};

/**
 * Премиальная FUT-карточка (переиспользуемая в коллекции/раскрытии/составах).
 * Поддерживает варианты стиля и палитры редкостей для сравнения.
 */
export function CardTile({ card, compact, size, variant, palette, interactive }: Props) {
  const resolvedSize = size ?? (compact ? 'sm' : 'md');
  return (
    <FutCard
      card={card}
      size={resolvedSize}
      variant={variant}
      palette={palette}
      interactive={interactive}
    />
  );
}

// Back-compat exports for existing imports (reveal/labels).
export const RARITY_LABEL = RARITY_LABEL_RU;
export const ROLE_LABEL = ROLE_TITLE_RU;