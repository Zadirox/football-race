'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Notice, Panel } from '@/components/ui/Panel';

/**
 * Ошибка внутри игровых маршрутов (docs/07 §4).
 *
 * Технические детали не показываем: только понятный текст, повтор запроса
 * и путь назад. `digest` нужен, чтобы найти этот случай в логах.
 */
export default function GameError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Game route failed:', error);
  }, [error]);

  return (
    <Panel hug title="Поле не открылось" subtitle="Сбой на нашей стороне, не в твоих ответах">
      <Notice>
        <div>
          Данные сезона не загрузились. Нажми «Попробовать снова» — чаще всего помогает с первого раза. Если нет,
          вернись на карту: ответы и кубики уже сохранены.
          {error.digest && <span className="error-digest">Код ошибки: {error.digest}</span>}
        </div>
      </Notice>
      <div className="actions-row">
        <button type="button" className="btn btn--primary" onClick={reset}>
          Попробовать снова
        </button>
        <Link href="/" className="btn btn--ghost">
          На карту
        </Link>
      </div>
    </Panel>
  );
}
