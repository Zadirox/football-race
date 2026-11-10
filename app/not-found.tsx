import Link from 'next/link';

/**
 * 404 для всего приложения (docs/07 §4).
 *
 * Корневой `not-found` рендерится вне игрового лэйаута, поэтому рисуем
 * самостоятельную карточку без шапки и карты.
 */
export default function NotFound() {
  return (
    <main className="state-page">
      <section className="state-card" aria-labelledby="not-found-title">
        <p className="state-card__eyebrow">Ошибка 404</p>
        <h1 id="not-found-title" className="state-card__title">
          Такой страницы нет на стадионе
        </h1>
        <p className="state-card__text">
          Возможно, ссылка устарела или в адресе опечатка. Всё живое — на карте сезона и в правилах.
        </p>
        <div className="actions-row">
          <Link href="/" className="btn btn--primary">
            На карту
          </Link>
          <Link href="/rules" className="btn btn--ghost">
            Правила
          </Link>
          <Link href="/predictions" className="btn btn--ghost">
            Предикты
          </Link>
        </div>
      </section>
    </main>
  );
}
