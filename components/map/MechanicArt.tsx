'use client';

import { useState } from 'react';
import { mechanic } from '@/lib/game/catalog';
import { artSrcFor } from '@/lib/ui/mechanic-art';

/**
 * Иконка механики: картинка из `public/art/mechanics/`, а пока файла нет —
 * SVG-заглушка в палитре игры. Замена картинки не требует правок кода.
 */

type MechanicArtProps = {
  code: string | null;
  size?: number;
  className?: string;
};

const POLARITY_FILL: Record<string, string> = {
  positive: '#c8f25a',
  negative: '#e4573d',
  trap: '#ffc46b',
  neutral: '#8fa6b8',
};

export function MechanicArt({ code, size = 64, className }: MechanicArtProps) {
  const [failed, setFailed] = useState(false);
  const src = artSrcFor(code);
  const entry = mechanic(code);
  const fill = POLARITY_FILL[entry?.polarity ?? 'neutral'] ?? POLARITY_FILL.neutral;

  return (
    <span
      className={['mechanic-art', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg className="mechanic-art__fallback" viewBox="0 0 48 48" role="presentation">
          <circle cx="24" cy="24" r="21" fill="none" stroke={fill} strokeWidth="3" opacity="0.85" />
          <circle cx="24" cy="24" r="15" fill={fill} opacity="0.12" />
          <text
            x="24"
            y="24"
            textAnchor="middle"
            dominantBaseline="central"
            fill={fill}
            fontSize="15"
            fontWeight="700"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {code ?? '★'}
          </text>
        </svg>
      )}
    </span>
  );
}
