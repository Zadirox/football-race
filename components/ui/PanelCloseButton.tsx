'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function PanelCloseButton() {
  const router = useRouter();

  const close = useCallback(() => {
    const holder = document.querySelector('.panel-holder');
    if (holder) holder.classList.add('panel-holder--closing');
    window.setTimeout(() => {
      router.push('/');
    }, 170);
  }, [router]);

  return (
    <button type="button" className="icon-btn" aria-label="Закрыть" title="Закрыть" onClick={close}>
      ✕
    </button>
  );
}