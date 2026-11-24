/**
 * Соответствие «код механики → файл картинки» (docs/03 §11).
 *
 * Имена файлов повторяют код из каталога, поэтому замена картинки не
 * требует правок кода: положил `07.png` в `public/art/mechanics/` — и он
 * появился в карточке клетки.
 */

const MECHANIC_CODE = /^(0[1-9]|[12]\d|3[0-7])$/;

export function artSrcFor(code: string | null | undefined): string | null {
  if (!code || !MECHANIC_CODE.test(code)) return null;
  return `/art/mechanics/${code}.png`;
}
