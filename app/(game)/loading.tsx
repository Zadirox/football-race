import { Panel } from '@/components/ui/Panel';

/**
 * Экран загрузки маршрута (docs/07 §4).
 *
 * Пока сервер считает сезон, показываем каркас страницы: заголовок уже на
 * месте, поэтому переход не выглядит пустым экраном.
 */
export default function GameLoading() {
  return (
    <Panel title="Загружаем поле" subtitle="Считаем сезон, кубики и события">
      <div className="loading" aria-busy="true" aria-live="polite">
        <p className="loading__caption">Идёт загрузка сезона</p>
        <div className="skeleton skeleton--head" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line-short" />
        <div className="skeleton skeleton--card" />
      </div>
    </Panel>
  );
}
