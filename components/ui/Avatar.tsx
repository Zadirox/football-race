'use client';

import { avatarColor } from '@/lib/avatar';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_PX: Record<AvatarSize, number> = {
  xs: 22,
  sm: 30,
  md: 40,
  lg: 56,
};

export function Avatar({
  nickname,
  avatarUrl,
  size = 'md',
  className,
  title,
}: {
  nickname: string;
  avatarUrl?: string | null;
  size?: AvatarSize;
  className?: string;
  title?: string;
}) {
  const px = SIZE_PX[size];
  const initial = (nickname || '?').slice(0, 1).toUpperCase();
  const bg = `linear-gradient(150deg, ${avatarColor(nickname || 'U', 0)}, ${avatarColor(nickname || 'U', 1)})`;

  if (avatarUrl) {
    return (
      <span
        className={`avatar avatar--img ${className ?? ''}`.trim()}
        title={title ?? nickname}
        aria-label={title ?? nickname}
        style={{
          width: px,
          height: px,
          minWidth: px,
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: bg,
          flex: '0 0 auto',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = 'none';
            const parent = el.parentElement;
            if (parent) {
              parent.textContent = initial;
              parent.style.fontWeight = '800';
              parent.style.color = '#fff';
            }
          }}
        />
      </span>
    );
  }

  return (
    <span
      className={`avatar ${className ?? ''}`.trim()}
      title={title ?? nickname}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title ?? nickname}
      style={{
        width: px,
        height: px,
        minWidth: px,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color: '#fff',
        fontWeight: 800,
        fontSize: Math.max(11, Math.round(px * 0.42)),
        lineHeight: 1,
        flex: '0 0 auto',
        userSelect: 'none',
      }}
    >
      {initial}
    </span>
  );
}
