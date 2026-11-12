import { Panel } from '@/components/ui/Panel';

/**
 * Каркас страницы, пока сервер считает сезон (docs/07 §4).
 *
 * Используется и как `loading.tsx` маршрута, и как заглушка `Suspense`
 * вокруг контента в оболочке: переход между экранами не выглядит
 * пустым местом, а шапка с картой остаются на месте.
 */
export function PanelLoading() {
  return (
    <Panel title="Загружаем" subtitle="Подтягиваем сезон, кубики и события">
      <div className="loading" aria-busy="true" aria-live="polite">
        <p className="loading__caption">Загружаем данные…</p>
        <div className="skeleton skeleton--head" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line-short" />
        <div className="skeleton skeleton--card" />
      </div>
    </Panel>
  );
}
