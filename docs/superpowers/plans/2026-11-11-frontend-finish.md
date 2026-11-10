# Доводка фронта «Футбольной гонки» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести фронт до релиза 12 ноября: карточка клетки с флейворами и иконками, анимация броска и ходьбы, состояния экранов, мобильная полировка, глубокая админка, финальный арт.

**Architecture:** Карточка клетки рендерится порталом в `document.body` с экранными координатами и чистой функцией позиционирования; игровые данные остаются в существующих `CellView`/`PlayerView`. Движение — очередь шагов поверх `position` из снимка, звук и анимации — на существующем WebAudio и CSS. Новые экраны и админ-действия переиспользуют текущие `Panel`, `Notice`, server actions и `db`.

**Tech Stack:** Next 15 App Router, React 19, TypeScript strict, Tailwind v4 (`app/globals.css`), Vitest, Postgres (`lib/db.ts`).

**Spec:** `docs/superpowers/specs/2026-11-11-frontend-finish-design.md`

## Global Constraints

- Проект **не под git**: коммитов нет, чекпоинт задачи — `npm run test:run` и `npm run typecheck` без ошибок.
- Dev-сервер может быть запущен на `http://localhost:3000`; **не запускать `npm run build` при работающем dev** — общий `.next` ломает dev; после сборки перезапускать dev.
- Новых зависимостей не добавлять. `motion` и `howler` в проекте есть, но не используются — этот план их не подключает.
- Весь интерфейс и комментарии — по-русски; время — МСК (`Europe/Moscow`).
- Файлы только UTF-8. Не перезаписывать их через PowerShell `Get-Content`/`Set-Content`.
- Иммутабельность: состояние обновляется копией, не мутацией.
- Звук по умолчанию выключен (`fg.muted`), включается только действием игрока.
- Карта масштабируется целиком: всё, что живёт внутри `.map-canvas`, компенсирует зум через `--inv-scale`.
- Мобильные ширины для проверки: 390×844 и 360×740; горизонтального скролла быть не должно.
- Флейворы обычных клеток ничего не меняют в правилах; бейдж «Обычная клетка» обязателен.
- Зоны карты в карточку не выводим до финального арта.

## Review Focus

1. **Карточка у правого/нижнего края на узком экране** — разворачивается и прижимается, ничего не обрезается; проверяется тестом `placeCard` и в браузере на 390 px.
2. **Драг/зум при открытой карточке** — карточка закрывается, клик после драга её не открывает; проверяется вручную в задаче 5.
3. **Доска из БД с другим числом обычных клеток (≤ 40)** — раздача флейворов не падает и не повторяет названия; тест `flavorMap` на 1, 38 и 41 клетке.
4. **Медленное устройство или `prefers-reduced-motion`** — ходьба завершается, кнопка броска разблокируется; проверяется тестом `walkDelay` и вручную с эмуляцией reduced motion.
5. **Открытая модалка события одновременно с карточкой клетки** — карточка не перекрывает модалку и не ловит фокус; проверяется вручную в задаче 5.

---

## Фаза 1. Клетки

### Task 1: Флейворы обычных клеток

**Files:**
- Create: `lib/game/cell-flavor.ts`
- Test: `tests/unit/cell-flavor.test.ts`

**Interfaces:**
- Produces:
  - `export type PlainFlavor = { title: string; line: string }`
  - `export const PLAIN_FLAVORS: readonly PlainFlavor[]`
  - `export function flavorFor(index: number): PlainFlavor`
  - `export function flavorMap(plainCells: number[]): Map<number, PlainFlavor>`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from 'vitest';
import { PLAIN_FLAVORS, flavorFor, flavorMap } from '@/lib/game/cell-flavor';

describe('cell-flavor', () => {
  it('содержит 40 уникальных названий', () => {
    expect(PLAIN_FLAVORS).toHaveLength(40);
    expect(new Set(PLAIN_FLAVORS.map((f) => f.title)).size).toBe(40);
  });

  it('держит названия короткими, а строки непустыми', () => {
    for (const flavor of PLAIN_FLAVORS) {
      expect(flavor.title.length).toBeLessThanOrEqual(24);
      expect(flavor.line.length).toBeGreaterThan(0);
      expect(flavor.line.length).toBeLessThanOrEqual(48);
    }
  });

  it('раздаёт флейворы по возрастанию номера клетки', () => {
    const map = flavorMap([5, 2, 3]);
    expect(map.get(2)?.title).toBe('Турникет и шаурма');
    expect(map.get(3)?.title).toBe('Клубный магазин');
    expect(map.get(5)?.title).toBe('Мама, я на стадионе');
  });

  it('покрывает 38 клеток без повторов', () => {
    const plain = [2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 14, 19, 22, 25, 27, 29, 31, 35, 37, 38, 40, 45, 50, 51, 54, 55, 57, 59, 60, 61, 63, 64, 67, 70, 73, 74, 77, 79];
    const map = flavorMap(plain);
    expect(map.size).toBe(38);
    expect(new Set([...map.values()].map((f) => f.title)).size).toBe(38);
    expect(map.get(79)?.title).toBe('Фейерверк');
  });

  it('не падает на пустом списке и на 41 клетке', () => {
    expect(flavorMap([]).size).toBe(0);
    const many = Array.from({ length: 41 }, (_, i) => i + 1);
    expect(flavorMap(many).size).toBe(41);
    expect(flavorFor(40).title).toBe('Турникет и шаурма');
  });

  it('нормализует отрицательный индекс', () => {
    expect(flavorFor(-1).title).toBe(PLAIN_FLAVORS[39]!.title);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/unit/cell-flavor.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/game/cell-flavor"`.

- [ ] **Step 3: Создать `lib/game/cell-flavor.ts` с этими данными**

```ts
/**
 * Флейворы обычных клеток: название и одна строка атмосферы.
 * Порядок = порядок пути; правила игры они не меняют.
 */
export type PlainFlavor = { title: string; line: string };

export const PLAIN_FLAVORS: readonly PlainFlavor[] = [
  { title: 'Турникет и шаурма', line: 'Пахнет победой и луком' },
  { title: 'Клубный магазин', line: 'Купил шарф — считай, свой' },
  { title: 'Мама, я на стадионе', line: 'Фото у входа важнее матча' },
  { title: 'Сосед с барабаном', line: 'Он не устанет. Ты — да' },
  { title: 'Первый снег', line: 'Мяч скользит, ноги — нет' },
  { title: 'Мокрый асфальт', line: 'Подкат по инерции' },
  { title: 'Жёлтые листья', line: 'Осень. Как и надежды' },
  { title: 'Очередь за билетом', line: 'Ты уже внутри, расслабься' },
  { title: 'Дымовая шашка', line: 'Сектор не дышит' },
  { title: 'Требл снится', line: 'Три кубка. Ну а вдруг' },
  { title: 'Пас в стенку', line: 'Стенка всегда отдаёт' },
  { title: 'Разминочные манекены', line: 'Обыграл всех. Они не сопротивлялись' },
  { title: 'Беговая дорожка', line: 'Ещё круг — и точно в основе' },
  { title: 'Автобус команды', line: 'Главное — успеть' },
  { title: 'Мячи в сетке', line: 'Собери обратно' },
  { title: 'Тики-така', line: 'Три паса назад — и вперёд' },
  { title: 'Гегенпресс', line: 'Беги, пока молодой' },
  { title: 'Второй этаж', line: 'Навес и надежда' },
  { title: 'Пятка Зидана', line: 'Пробуй, получится раз в жизни' },
  { title: 'Сиууу!', line: 'Прыжок и посадка. Колени береги' },
  { title: 'Ты не пройдёшь', line: 'Сказал защитник и пропустил' },
  { title: 'Пас назад', line: 'Безопасно. Скучно. Работает' },
  { title: 'Игра на ноль', line: 'Ноль — тоже счёт' },
  { title: 'Автобус Моуринью', line: 'Паркуйся и не выходи' },
  { title: 'Разговор в тоннеле', line: '«Ты видел, что он сказал?»' },
  { title: 'Скамейка запасных', line: 'Отсюда всё видно' },
  { title: 'Установка тренера', line: 'Доска, маркер, вера' },
  { title: 'Второй тайм', line: 'Сейчас пойдёт' },
  { title: 'Добавленное время', line: 'Судья решил: ещё немного' },
  { title: 'Душ после матча', line: 'Кто последний — тот без горячей воды' },
  { title: 'Бутсы в грязи', line: 'Чистые бутсы — к проигрышу' },
  { title: 'Тикток в перерыве', line: 'Танцуй, пока не начался второй' },
  { title: 'Челлендж с мячом', line: 'Изи, если не снимать' },
  { title: 'Шаурма у входа', line: 'Сытно и опасно' },
  { title: 'Каток в фан-зоне', line: 'Подкат на коньках' },
  { title: 'Гирлянда на удачу', line: 'Мигает — значит, повезёт' },
  { title: 'Пьедестал', line: 'Ещё чуть-чуть' },
  { title: 'Фейерверк', line: 'Рано? Рано' },
  { title: 'Кубок в руках', line: 'Не роняй' },
  { title: 'Интервью после матча', line: '«Мы играли до конца»' },
];

export function flavorFor(index: number): PlainFlavor {
  const size = PLAIN_FLAVORS.length;
  const safe = ((Math.trunc(index) % size) + size) % size;
  return PLAIN_FLAVORS[safe]!;
}

export function flavorMap(plainCells: number[]): Map<number, PlainFlavor> {
  const sorted = [...plainCells].sort((a, b) => a - b);
  return new Map(sorted.map((idx, position) => [idx, flavorFor(position)]));
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npx vitest run tests/unit/cell-flavor.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Чекпоинт**

Run: `npm run test:run` и `npm run typecheck`
Expected: все тесты зелёные, typecheck без ошибок.

---

### Task 2: Позиционирование карточки

**Files:**
- Create: `lib/ui/card-placement.ts`
- Test: `tests/unit/card-placement.test.ts`

**Interfaces:**
- Produces:
  - `export type Rect = { left: number; top: number; width: number; height: number }`
  - `export type Placement = { left: number; top: number; side: 'top' | 'bottom'; arrowX: number }`
  - `export function placeCard(anchor: Rect, card: { width: number; height: number }, viewport: { width: number; height: number }, gap?: number, margin?: number): Placement`
- Значения по умолчанию: `gap = 14`, `margin = 12`, стрелка не ближе 16 px к краю карточки.

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from 'vitest';
import { placeCard } from '@/lib/ui/card-placement';

const cell = { left: 600, top: 400, width: 30, height: 30 };
const card = { width: 320, height: 180 };
const desktop = { width: 1280, height: 800 };

describe('placeCard', () => {
  it('ставит карточку над клеткой по центру', () => {
    expect(placeCard(cell, card, desktop)).toEqual({ left: 455, top: 206, side: 'top', arrowX: 160 });
  });

  it('разворачивает вниз, если сверху нет места', () => {
    const result = placeCard({ ...cell, top: 20 }, card, desktop);
    expect(result.side).toBe('bottom');
    expect(result.top).toBe(64);
  });

  it('прижимает к левому краю и держит стрелку внутри', () => {
    const result = placeCard({ ...cell, left: 4 }, card, desktop);
    expect(result.left).toBe(12);
    expect(result.arrowX).toBe(16);
  });

  it('прижимает к правому краю', () => {
    const result = placeCard({ ...cell, left: 1246 }, card, desktop);
    expect(result.left).toBe(948);
    expect(result.arrowX).toBe(304);
  });

  it('работает на мобильном вьюпорте', () => {
    const result = placeCard({ left: 180, top: 500, width: 30, height: 30 }, { width: 320, height: 220 }, { width: 390, height: 844 });
    expect(result.left).toBe(35);
    expect(result.side).toBe('top');
  });

  it('прижимается к низу и не уходит за экран', () => {
    const result = placeCard({ left: 100, top: 60, width: 30, height: 30 }, { width: 320, height: 240 }, { width: 390, height: 300 });
    expect(result.side).toBe('bottom');
    expect(result.top + 240).toBeLessThanOrEqual(288);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/unit/card-placement.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/ui/card-placement.ts`**

Алгоритм: `centerX = anchor.left + anchor.width / 2`; по умолчанию `side = 'top'`, `top = anchor.top - gap - card.height`; если `top < margin` — `side = 'bottom'`, `top = anchor.top + anchor.height + gap`; если и снизу не влезает — прижать `top` к `viewport.height - card.height - margin` (но не выше `margin`). `left = clamp(centerX - card.width / 2, margin, viewport.width - card.width - margin)`; если вьюпорт уже карточки — `left = margin`. `arrowX = clamp(centerX - left, 16, card.width - 16)`.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/card-placement.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Чекпоинт**

Run: `npm run test:run` и `npm run typecheck`
Expected: зелёные.

---

### Task 3: Иконки механик и промпты

**Files:**
- Create: `lib/ui/mechanic-art.ts`, `components/map/MechanicArt.tsx`, `public/art/mechanics/README.md`
- Test: `tests/unit/mechanic-art.test.ts`
- Modify: `app/globals.css` (классы `.mechanic-art`, `.mechanic-art__fallback`)

**Interfaces:**
- Produces:
  - `export function artSrcFor(code: string | null | undefined): string | null` — `/art/mechanics/01.png` для кодов `01`–`18`, иначе `null`.
  - `export function MechanicArt({ code, size = 64, className }: { code: string | null; size?: number; className?: string })`
- `MechanicArt` — клиентский компонент: `<img>` с `onError`, при ошибке рисует SVG-заглушку по полярности и коду.

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from 'vitest';
import { artSrcFor } from '@/lib/ui/mechanic-art';

describe('artSrcFor', () => {
  it('строит путь для механик 01–18', () => {
    expect(artSrcFor('01')).toBe('/art/mechanics/01.png');
    expect(artSrcFor('18')).toBe('/art/mechanics/18.png');
  });

  it('возвращает null для пустого и неизвестного кода', () => {
    expect(artSrcFor(null)).toBeNull();
    expect(artSrcFor('1')).toBeNull();
    expect(artSrcFor('19')).toBeNull();
    expect(artSrcFor('xx')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/unit/mechanic-art.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/ui/mechanic-art.ts`**

Регулярка `^(0[1-9]|1[0-8])$`; при совпадении вернуть `` `/art/mechanics/${code}.png` ``, иначе `null`.

- [ ] **Step 4: Создать `components/map/MechanicArt.tsx`**

`'use client'`; состояние `failed`; `<img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)}>`; при `src === null || failed` — `<svg className="mechanic-art__fallback" viewBox="0 0 48 48">` с кругом в цвете полярности (`mechanic(code)?.polarity`) и номером механики по центру. Контейнер — `<span className={...} style={{ width: size, height: size }}>`.

- [ ] **Step 5: Создать `public/art/mechanics/README.md`**

Внутри: палитра (`#0b141c`, `#8fa6b8`, `#c8f25a`, `#ffc46b`, `#e4573d`), формат PNG 512×512, прозрачный фон, один стиль «плоская изометрия, мягкий свет сверху слева, без текста». Таблица: `01` Контратака — стрелка с мячом; `02` Офсайд — поднятый флажок; `03` Голевая передача — пас с траекторией; `04` Скользкий газон — след подката; `05` Домашние трибуны — трибуна с огнями; `06` Щитки — щиток; `07` Раздевалка — шкафчик; `08` Жёлтая карточка — карточка; `09` VAR — экран с повтором; `10` Тактическая схема — доска с линиями; `11–18` — список из `catalog.ts`. Промпт-шаблон на английском и негативный промпт (`text, letters, watermark, photo, 3d render, noisy background`).

- [ ] **Step 6: Добавить CSS**

`.mechanic-art { display: inline-grid; place-items: center; flex: none; }` и `.mechanic-art__fallback { width: 100%; height: 100%; }`. Никаких теней, чтобы не спорить с карточкой.

- [ ] **Step 7: Запустить тест и typecheck**

Run: `npx vitest run tests/unit/mechanic-art.test.ts` и `npm run typecheck`
Expected: PASS, typecheck без ошибок.

---

### Task 4: Содержимое карточки

**Files:**
- Create: `lib/ui/cell-card-content.ts`
- Test: `tests/unit/cell-card-content.test.ts`
- Modify: `lib/game/catalog.ts` — только если нужен экспорт `POLARITY_LABEL` (он уже есть).

**Interfaces:**
- Produces:
  - `export type CardTone = 'plain' | 'positive' | 'negative' | 'trap' | 'neutral' | 'start' | 'finish'`
  - `export type CardContent = { badge: string; tone: CardTone; title: string; line: string; note: string | null; mechanicCode: string | null }`
  - `export function cellCardContent(cell: CellView, flavor: PlainFlavor | null): CardContent`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from 'vitest';
import { cellCardContent } from '@/lib/ui/cell-card-content';

const flavor = { title: 'Тики-така', line: 'Три паса назад — и вперёд' };

describe('cellCardContent', () => {
  it('обычная клетка явно называет себя обычной', () => {
    const content = cellCardContent({ idx: 27, kind: 'plain', mechanicCode: null }, flavor);
    expect(content.badge).toBe('Обычная клетка');
    expect(content.tone).toBe('plain');
    expect(content.title).toBe('Тики-така');
    expect(content.line).toBe('Три паса назад — и вперёд');
    expect(content.note).toBeNull();
  });

  it('без флейвора остаётся честной заглушкой', () => {
    const content = cellCardContent({ idx: 27, kind: 'plain', mechanicCode: null }, null);
    expect(content.badge).toBe('Обычная клетка');
    expect(content.title).toBe('Обычная клетка');
    expect(content.line).toBe('Просто шаг вперёд.');
  });

  it('событийная клетка показывает механику и полярность', () => {
    const content = cellCardContent({ idx: 5, kind: 'event', mechanicCode: '01' }, null);
    expect(content.badge).toBe('Позитив');
    expect(content.tone).toBe('positive');
    expect(content.title).toBe('Контратака');
    expect(content.line).toBe('+3 клетки вперёд');
    expect(content.note).toBe('Сработает, когда встанешь на клетку');
    expect(content.mechanicCode).toBe('01');
  });

  it('ловушка красится отдельно', () => {
    const content = cellCardContent({ idx: 9, kind: 'event', mechanicCode: '09' }, null);
    expect(content.badge).toBe('Ловушка');
    expect(content.tone).toBe('trap');
  });

  it('старт и финиш имеют свои тексты', () => {
    expect(cellCardContent({ idx: 1, kind: 'start', mechanicCode: null }, null).title).toBe('Старт');
    expect(cellCardContent({ idx: 80, kind: 'finish', mechanicCode: null }, null).tone).toBe('finish');
    expect(cellCardContent({ idx: 80, kind: 'finish', mechanicCode: null }, null).line).toContain('Кубок');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/unit/cell-card-content.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/ui/cell-card-content.ts`**

Порядок веток: `start` → `finish` → `event` через `mechanic(code)` → `plain`. Для события без найденной механики — бейдж «Событие», тон `neutral`, `line = 'Событие без описания'`. Для обычной клетки с флейвором — бейдж «Обычная клетка», иначе заглушка из теста.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/cell-card-content.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Чекпоинт**

Run: `npm run test:run` и `npm run typecheck`
Expected: зелёные.

---

### Task 5: Карточка и маркеры на карте

**Files:**
- Create: `components/map/CellCard.tsx`
- Modify: `components/map/MapBoard.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `placeCard`, `cellCardContent`, `MechanicArt`, `flavorMap`.
- Produces:
  - `export function CellCard({ cell, flavor, anchor }: { cell: CellView; flavor: PlainFlavor | null; anchor: Rect })`
  - `MapBoard` сохраняет текущие пропсы: `cells`, `players`, `onSelectPlayer`, `selectedPlayerId`, `inverseScale`.

- [ ] **Step 1: Сверстать `CellCard`**

`'use client'`; `createPortal` в `document.body`; локальное состояние `placement`, пересчёт в `useLayoutEffect` по `anchor` и `cardRef.current.getBoundingClientRect()`, плюс слушатель `window.resize`. Разметка: `.cell-card` → `.cell-card__stripe` (цвет по `tone`), `.cell-card__head` (номер, `MechanicArt`, бейдж), `.cell-card__title`, `.cell-card__line`, `.cell-card__perf`, `.cell-card__note`. `role="tooltip"`, `id="cell-card"`, `pointer-events: none`. Номер — `cell.idx`, у финиша `★`.

- [ ] **Step 2: Добавить CSS карточки**

`.cell-card` — `position: fixed; z-index: 45; width: min(320px, calc(100vw - 24px)); border-radius: 16px; background: rgba(8,16,23,.97); border: 1px solid var(--panel-line); box-shadow: 0 24px 60px -24px #000;` появление `cell-card-in 140ms ease-out` (translateY 6px + opacity). `.cell-card__stripe` — 4 px, цвет по `data-tone` (`plain` — `var(--frost)`, `positive` — `var(--lime)`, `negative` — `var(--danger)`, `trap` — `var(--amber)`, `neutral` — `var(--info)`, `start`/`finish` — `var(--gold)`). Перфорация — `repeating-linear-gradient(90deg, transparent 0 6px, rgba(255,255,255,.12) 6px 7px)` высотой 1 px. `@media (prefers-reduced-motion: reduce)` — без анимации.

- [ ] **Step 3: Переписать состояние в `MapBoard`**

Одно состояние `active: { idx: number; anchor: Rect; source: 'hover' | 'pin' | 'focus' } | null`. Открытие берёт `event.currentTarget.getBoundingClientRect()`; `source` зависит от типа события. Мышь: `onMouseEnter` открывает, `onMouseLeave` закрывает только при `source === 'hover'`. Клик: открывает `pin` только для `pointerType !== 'mouse'`; для мыши ничего не делает (карточка уже видна). Фокус и `blur` — `source: 'focus'`. `Escape` и `pointerdown` вне `.cell` закрывают `pin`/`focus`. `wheel` и `pointerdown` на `.map-viewport` закрывают любую карточку. Клик после драга игнорируется через существующий `onClickCapture` в `GameHud` (проверить, что `stopPropagation` не ломает открытие).

- [ ] **Step 4: Подключить флейворы и карточку**

В `MapBoard` посчитать `const plainCells = cells.filter((c) => c.kind === 'plain').map((c) => c.idx)` и `flavorMap(plainCells)` через `useMemo`. Рендерить `<CellCard cell={activeCell} flavor={...} anchor={active.anchor} />` рядом с маркерами. Убрать старый `.cell-tip` и его состояние `hovered`.

- [ ] **Step 5: Обновить маркеры**

В `.cell`: номер 12–13 px при масштабе 1, внутреннее кольцо `box-shadow: inset 0 0 0 1px rgba(255,255,255,.08)`; событийная клетка получает точку `::after` 4 px внизу; наведение — ореол `0 0 0 5px rgba(200,242,90,.16)`; пройденные — `opacity .5`; финиш — 40 px. `aria-label` расширить: для обычной клетки `Клетка 27, Тики-така, обычная клетка`, для события — название механики. Маркеру, у которого открыта карточка, ставить `aria-describedby="cell-card"`.

- [ ] **Step 6: Проверить в браузере**

Открыть `http://localhost:3000`. Проверить: наведение на клетку у левого края, у правого, у нижнего; наведение на событийную и обычную; `Escape`; тап в мобильной эмуляции 390×844; драг карты при открытой карточке (должна закрыться); карточка не мешает открыть модалку события.

- [ ] **Step 7: Чекпоинт**

Run: `npm run test:run` и `npm run typecheck`
Expected: зелёные, в консоли браузера нет ошибок.

---

## Фаза 2. Движение и звук

### Task 6: Шаги ходьбы

**Files:**
- Create: `lib/game/walk.ts`
- Test: `tests/unit/walk.test.ts`

**Interfaces:**
- Produces:
  - `export function stepSequence(from: number, to: number, min?: number, max?: number): number[]` — промежуточные позиции, включая конечную, без стартовой; `min = 1`, `max = 80`.
  - `export function walkDelay(stepIndex: number, msPerCell?: number): number` — `stepIndex * msPerCell`, по умолчанию 220.

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from 'vitest';
import { stepSequence, walkDelay } from '@/lib/game/walk';

describe('walk', () => {
  it('идёт вперёд по одной клетке', () => {
    expect(stepSequence(3, 8)).toEqual([4, 5, 6, 7, 8]);
  });

  it('идёт назад по одной клетке', () => {
    expect(stepSequence(5, 2)).toEqual([4, 3, 2]);
  });

  it('обрезает по границам поля', () => {
    expect(stepSequence(79, 90)).toEqual([80]);
    expect(stepSequence(0, 2)).toEqual([2]);
    expect(stepSequence(1, 0)).toEqual([]);
  });

  it('не двигается, если позиция не изменилась', () => {
    expect(stepSequence(40, 40)).toEqual([]);
  });

  it('считает задержку шага', () => {
    expect(walkDelay(0)).toBe(0);
    expect(walkDelay(3)).toBe(660);
    expect(walkDelay(2, 140)).toBe(280);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/unit/walk.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `lib/game/walk.ts`**

`stepSequence`: `start = clamp(Math.trunc(from), min, max)`, `end = clamp(Math.trunc(to), min, max)`, `dir = Math.sign(end - start)`, цикл от `start + dir` до `end` включительно. `walkDelay` — `Math.max(0, Math.trunc(stepIndex)) * msPerCell`.

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/walk.test.ts`
Expected: PASS, 5 тестов.

---

### Task 7: Ходьба персонажей

**Files:**
- Create: `components/map/usePlayerWalk.ts`
- Modify: `components/map/GameHud.tsx`

**Interfaces:**
- Produces: `export function usePlayerWalk(players: PlayerView[], msPerCell?: number): { displayed: PlayerView[]; walking: Record<string, boolean> }`
- `displayed` содержит промежуточные позиции; `walking[profileId] === true`, пока очередь шагов не доиграна.
- `GameHud` блокирует бросок, пока `walking[me.profileId]`, и играет `play('step')` на каждый шаг, `play('land')` на последний.

- [ ] **Step 1: Создать хук**

Хранить `displayed` в состоянии. На изменение `players` сравнить позиции с предыдущими: для каждого изменившегося игрока построить `stepSequence`, поставить таймеры `setTimeout` с `walkDelay(i, msPerCell)`, обновляя только его позицию в `displayed`. Таймеры складывать в `Map<string, number[]>`, чистить при новом изменении и в `useEffect`-cleanup. Игроков без изменений не трогать.

- [ ] **Step 2: Подключить в `GameHud`**

`const { displayed, walking } = usePlayerWalk(players);` — передать `displayed` в `MapBoard` и в `PlayerPopover`. В `finishMove` задержать `play('positive'|'negative'|'land')` и открытие модалки до окончания шагов: вычислить `const steps = stepSequence(me.position, final.position).length` и проиграть звук/модалку через `window.setTimeout(..., walkDelay(steps))`. `lastRoll` обновлять сразу, чтобы лоток показал значение.

- [ ] **Step 3: Синхронизировать кнопку броска**

`rollDisabled` и `rollHelper` учитывают `walking[me?.profileId ?? '']`: пока идёт ход — «Идём по клеткам». После последнего шага `busy` снимается (в демо — уже снят, но кнопка ждёт `walking`).

- [ ] **Step 4: Проверить в браузере**

Демо-бросок на 1, 3, 6 клеток; событие «Контратака» (+3); «Офсайд» (−2); тактика; финиш. Убедиться, что персонаж идёт по одной клетке, звук шага слышен после включения, кнопка не залипает.

- [ ] **Step 5: Чекпоинт**

Run: `npm run test:run` и `npm run typecheck`
Expected: зелёные.

---

### Task 8: Анимация кубика

**Files:**
- Modify: `components/map/GameHud.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `DICE_SIDES`, `rollValue`; локальное состояние `tumble`.
- Produces: классы `.die--tumbling`, `.die--settle`; кнопка броска показывает грани вместо «…».

- [ ] **Step 1: Добавить состояние тряски**

В `GameHud`: `const [tumble, setTumble] = useState<{ tier: DiceTier; face: number } | null>(null)`. В `handleRoll` перед `setBusy(true)` запустить `setTumble({ tier, face: DICE_SIDES[tier] })` и `window.setInterval` каждые 70 мс менять `face` на случайное 1..`DICE_SIDES[tier]`; через 700 мс очистить интервал, поставить финальную грань из `lastRoll`/результата и `play('land')`. Интервал хранить в `useRef`, чистить в `useEffect`-cleanup.

- [ ] **Step 2: Показать грань в кнопке и лотке**

В `.dice-roll-btn` вместо `★`/`…` рисовать `{tumble ? tumble.face : '★'}`; на время `tumble` добавить `data-tumbling="true"`. В `.dice-chip` выбранного тира — тоже показывать `tumble.face`, если тир совпадает.

- [ ] **Step 3: CSS**

`.die--tumbling { animation: die-shake 0.16s linear infinite; }`, `@keyframes die-shake` — поворот −8°/8° и `translateY(-2px)`; `.die--settle { animation: die-settle 0.28s cubic-bezier(.2,1.4,.4,1); }`. При `prefers-reduced-motion` — без тряски, только смена числа.

- [ ] **Step 4: Проверить**

Демо и БД-режим (если есть `.env`): кубик трясётся 700 мс, затем начинается ходьба. В БД-режиме во время ожидания сервера кнопка остаётся `busy`.

- [ ] **Step 5: Чекпоинт**

Run: `npm run typecheck`
Expected: без ошибок; в браузере анимация работает.

---

### Task 9: Живость интерфейса

**Files:**
- Modify: `app/globals.css`, `components/map/GameHud.tsx` (только классы/флаги), `components/ui/Panel.tsx` (если нужен класс появления)

**Interfaces:**
- Produces: классы `.feed__item--enter`, `.toast--enter`, `.modal--enter`, `.page-enter`; общий `@media (prefers-reduced-motion: reduce)` отключает все новые анимации.

- [ ] **Step 1: Лента и тосты**

Новые элементы ленты получают класс появления (`feed-in 180ms ease-out`, задержка по индексу не больше 200 мс). Тосты — `.toast--enter` (слайд снизу 12 px + opacity). Существующий `error-box` для тоста заменить на `.toast` с `role="status"` (для ошибок — `role="alert"`).

- [ ] **Step 2: Модалки**

`.modal` — затемнение `modal-fade 160ms`; `.modal__card` — `modal-pop 180ms cubic-bezier(.2,1.3,.4,1)` (scale .96 → 1). Не менять структуру и обработчики.

- [ ] **Step 3: Появление страниц**

Добавить класс `page-enter` на корневой контейнер `Panel` (или `main` в `app/(game)/layout.tsx`): `page-in 150ms ease-out` (opacity + translateY 4px).

- [ ] **Step 4: Reduced motion**

Один блок `@media (prefers-reduced-motion: reduce)` в конце `globals.css`: `animation: none !important; transition-duration: 1ms !important;` для новых классов и `.token`, `.cell`.

- [ ] **Step 5: Проверить**

Открыть модалку VAR (демо), ленту, тост «Кубиков нет». В DevTools включить `Emulate CSS prefers-reduced-motion: reduce` — анимации исчезают, интерфейс работает.

---

## Фаза 3. Состояния

### Task 10: loading, error, 404

**Files:**
- Create: `app/(game)/loading.tsx`, `app/(game)/error.tsx`, `app/not-found.tsx`
- Modify: `app/globals.css` (скелет-классы)

**Interfaces:**
- `error.tsx` — клиентский, принимает `{ error: Error & { digest?: string }, reset: () => void }`; логирует `console.error` и показывает «Матч прерван» + кнопку «Попробовать снова».

- [ ] **Step 1: `loading.tsx`**

Серверный компонент: `Panel` с заголовком «Собираем день», три скелет-блока `.skeleton` (карта, лента, лоток) и подпись «Обычно меньше секунды».

- [ ] **Step 2: `error.tsx`**

`'use client'`; карточка по центру, текст «Матч прерван. Данные не потеряны — попробуй ещё раз», кнопка `reset`, ссылка на `/`. Без стека и технических деталей пользователю.

- [ ] **Step 3: `not-found.tsx`**

Серверный: «Такой страницы нет на стадионе», ссылки на `/`, `/rules`, `/predictions`.

- [ ] **Step 4: CSS скелета**

`.skeleton { background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04)); background-size: 200% 100%; animation: skeleton 1.4s linear infinite; border-radius: 12px; }`; при reduced motion — статичный фон.

- [ ] **Step 5: Пустые состояния**

Проверить `/matches`, `/predictions`, `/participants` и ленту: при пустом массиве должен быть `EmptyState` с одной строкой и действием («Матчи появятся после синка», «Вопросы откроются утром», «Пока только ты»). Добавить `EmptyState` там, где сейчас пустой блок, без новых компонентов.

- [ ] **Step 6: Проверить**

`http://localhost:3000/нет-такой` → 404. Временно бросить `throw new Error('test')` в `app/(game)/page.tsx`, открыть `/`, увидеть error-экран, нажать «Попробовать снова», вернуть файл.

- [ ] **Step 7: Чекпоинт**

Run: `npm run typecheck` и `npm run test:run`
Expected: зелёные.

---

### Task 11: Онбординг

**Files:**
- Create: `components/game/Onboarding.tsx`
- Modify: `app/(game)/layout.tsx`, `app/(game)/rules/page.tsx`

**Interfaces:**
- Produces: `export function Onboarding({ forceOpen = false }: { forceOpen?: boolean })`; ключ `fg.onboarded.v1`.
- Шаги: 1) «Брось кубик» — «Один бросок в день, кубик тратится»; 2) «Иди по клетке» — «Событие на клетке срабатывает сразу»; 3) «Отвечай на предикты» — «Точность и очки идут в три рейтинга».

- [ ] **Step 1: Компонент**

`'use client'`; `useEffect` читает `localStorage.getItem('fg.onboarded.v1')`; если нет и `!forceOpen` — показывается затемнение и карточка с текущим шагом, точками прогресса, кнопками «Дальше»/«Пропустить» и «Начать». На последнем шаге кнопка «Поехали». Запись флага при закрытии. `Escape` закрывает. Кнопка «Начать» ведёт на `/predictions`.

- [ ] **Step 2: Подключить в layout**

В `app/(game)/layout.tsx` рядом с детьми рендерить `<Onboarding />` (один раз на все экраны игры).

- [ ] **Step 3: Повторный запуск**

На `/rules` добавить кнопку «Показать вступление» — ссылка `/?intro=1`; в `GameHud`/layout читать `searchParams` нельзя в клиенте без пропа, поэтому передать `forceOpen={searchParams.intro === '1'}` из серверного layout, если это просто; иначе кнопка сбрасывает `localStorage` и делает `router.refresh()`. Выбрать второй вариант, если layout не принимает `searchParams`.

- [ ] **Step 4: Проверить**

Очистить localStorage, зайти на `/`, пройти три шага, перезагрузить — онбординг не появляется. Открыть из «Правил» — появляется снова.

---

### Task 12: Зритель и гость

**Files:**
- Modify: `components/map/GameHud.tsx`, `app/(game)/predictions/PredictionsClient.tsx` (если нужно), `components/shell/Header.tsx`

**Interfaces:**
- `const canPlay = snapshot.me?.isPlayer === true;` — лоток кубиков и бросок доступны только участнику.
- `snapshot.me === null` — гость: в шапке кнопка «Войти», на карте плашка «Смотришь как гость».

- [ ] **Step 1: Плашка режима**

Над картой добавить `.role-banner`: зритель — «Ты зритель: смотри и болей, кубики и предикты недоступны»; гость — «Ты гость: войди, чтобы играть» + ссылка `/login`. Игроку плашку не показывать.

- [ ] **Step 2: Лоток**

Если `canPlay === false`, лоток рендерится с `data-disabled="true"`, все кнопки `disabled`, helper — «Играет основной состав». Не скрывать лоток полностью, чтобы зритель понимал механику.

- [ ] **Step 3: Предикты**

В `PredictionsClient` уже есть `canPlay`; проверить, что для зрителя варианты показываются, но не кликаются, и есть подпись «Отвечают участники сезона». Гость видит ссылку на вход.

- [ ] **Step 4: Проверить**

Демо: `snapshot.me` — игрок. Временно поменять `isPlayer: false` в `lib/demo/snapshot.ts`, проверить плашку и лоток, вернуть.

- [ ] **Step 5: Чекпоинт**

Run: `npm run test:run` и `npm run typecheck`
Expected: зелёные.

---

## Фаза 4. Мобильная полировка

### Task 13: Мобильная раскладка

**Files:**
- Modify: `app/globals.css`, `components/shell/Header.tsx`, `components/map/GameHud.tsx`

**Interfaces:**
- Новые брейкпоинты: `@media (max-width: 900px)`, `@media (max-width: 640px)`.
- Классы: `.header--compact`, `.feed--collapsed`, `.dice-tray--dock`, `.table--cards`.

- [ ] **Step 1: Шапка**

На <900 px: логотип и таймер в первой строке, табы — вторая строка с `overflow-x: auto`, `scrollbar-width: none`; таб «Админка» не ломает ширину. Кнопка звука остаётся доступной.

- [ ] **Step 2: Лоток кубиков**

На <640 px `.dice-tray` становится нижним доком: `left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom));` с фоном панели; банк кубиков — в одну строку; кнопка броска — на всю ширину.

- [ ] **Step 3: Лента**

На <900 px лента по умолчанию свёрнута (`feedOpen` инициализируется `window.innerWidth > 900` только на клиенте, через `useEffect`, чтобы не ломать SSR). Кнопка «Комментатор» показывает индикатор, если есть новые записи.

- [ ] **Step 4: Таблицы**

`.table--cards` на <640 px: `thead` скрыт, `tr` — карточка, `td` — строки «label: value» через `data-label`. Применить на `/ratings`, `/participants`, `/admin` (таблица участников).

- [ ] **Step 5: Карточка клетки**

Убедиться, что `width: min(320px, calc(100vw - 24px))` и максимальная высота `55vh` с внутренним скроллом текста.

- [ ] **Step 6: Проверить**

390×844 и 360×740: шапка, карта, карточка у края, лоток, лента, предикты, рейтинги, админка. Горизонтального скролла нет, кнопка броска не перекрыта.

- [ ] **Step 7: Чекпоинт**

Run: `npm run typecheck`
Expected: без ошибок.

---

## Фаза 5. Админка

### Task 14: Схемы и серверные действия админки

**Files:**
- Create: `lib/actions/admin-schemas.ts`, `lib/repo/admin-tools.ts`
- Modify: `lib/actions/admin.ts`
- Test: `tests/unit/admin-schemas.test.ts`

**Interfaces:**
- Produces:
  - `matchUpdateSchema`, `diceGrantSchema`, `pendingCloseSchema`, `roleChangeSchema` (zod).
  - `updateMatchAction(input: unknown): Promise<AdminRunResult>`
  - `grantDiceAction(input: unknown): Promise<AdminRunResult>`
  - `forceClosePendingAction(input: unknown): Promise<AdminRunResult>`
  - `changeRoleAction(input: unknown): Promise<AdminRunResult>`
  - `export type AdminPendingView = { id: string; nickname: string; kind: string; expiresAt: string }`
  - `export async function listPendingForAdmin(): Promise<AdminPendingView[]>`
- Репозиторий: `updateMatch`, `grantDice`, `forceClosePending`, `setRole`, `listPendingForAdmin` — все принимают уже провалидированные данные и работают через `db`.

- [ ] **Step 1: Написать падающий тест схем**

```ts
import { describe, expect, it } from 'vitest';
import { diceGrantSchema, matchUpdateSchema, roleChangeSchema } from '@/lib/actions/admin-schemas';

describe('admin schemas', () => {
  it('принимает корректную правку матча', () => {
    expect(matchUpdateSchema.safeParse({ matchId: '00000000-0000-4000-8000-000000000001', status: 'FT', homeScore: 2, awayScore: 1, minute: null }).success).toBe(true);
  });

  it('отклоняет отрицательный счёт и неизвестный статус', () => {
    expect(matchUpdateSchema.safeParse({ matchId: '00000000-0000-4000-8000-000000000001', status: 'XX', homeScore: -1, awayScore: 0, minute: null }).success).toBe(false);
  });

  it('ограничивает выдачу кубиков', () => {
    expect(diceGrantSchema.safeParse({ profileId: '00000000-0000-4000-8000-000000000001', tier: 'gold', count: 3, reason: 'бонус' }).success).toBe(true);
    expect(diceGrantSchema.safeParse({ profileId: '00000000-0000-4000-8000-000000000001', tier: 'gold', count: 0, reason: 'бонус' }).success).toBe(false);
    expect(diceGrantSchema.safeParse({ profileId: '00000000-0000-4000-8000-000000000001', tier: 'gold', count: 11, reason: 'бонус' }).success).toBe(false);
  });

  it('знает только три роли', () => {
    expect(roleChangeSchema.safeParse({ profileId: '00000000-0000-4000-8000-000000000001', role: 'spectator' }).success).toBe(true);
    expect(roleChangeSchema.safeParse({ profileId: '00000000-0000-4000-8000-000000000001', role: 'owner' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run tests/unit/admin-schemas.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать схемы**

`matchUpdateSchema`: `matchId: z.uuid()`, `status` enum `NS/LIVE/HT/FT/PST/CANC/ABD`, `homeScore`/`awayScore` int 0..99 nullable, `minute` int 0..130 nullable. `diceGrantSchema`: `z.uuid()`, tier enum, count 1..10, reason 3..200. `pendingCloseSchema`: `z.uuid()`. `roleChangeSchema`: `z.uuid()` + role enum. (Zod 4: `z.uuid()` вместо устаревшего `z.string().uuid()`.)

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/unit/admin-schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Репозиторий `lib/repo/admin-tools.ts`**

`updateMatch(input)`: `UPDATE matches SET status = $2, home_score = $3, away_score = $4, minute = $5, updated_at = now() WHERE id = $1 RETURNING id`. Все параметры передавать через тегированный шаблон `db`, без конкатенации строк. `grantDice(input)`: одной транзакцией `SELECT 1 FROM profiles WHERE id = $1`, затем вставить `count` отдельных строк в `dice` (`tier`, `sides` из `DICE_SIDES`, `source = 'admin'`, `matchday_id = null`, `season_id` — активный сезон). `forceClosePending(input)`: `lockAnyPending`, применить безопасную ветку как в `expirePending` (переиспользовать `expiryDecision` из `lib/game/pending-expiry.ts`), записать активность. `setRole(input)`: проверить, что при снятии `admin` в `profiles` остаётся хотя бы один админ (`SELECT count(*)::int AS n FROM profiles WHERE role = 'admin'`), затем `UPDATE profiles SET role = $2 WHERE id = $1`. `listPendingForAdmin()`: `SELECT p.id, pr.nickname, p.kind, p.expires_at FROM pending_actions p JOIN profiles pr ON pr.id = p.profile_id WHERE p.resolved_at IS NULL ORDER BY p.expires_at ASC LIMIT 50`. Каждое изменяющее действие дописывает строку в `audit_log` (`actor_id`, `action`, `entity`, `entity_id`, `before`, `after`).

- [ ] **Step 6: Серверные действия**

Каждое: `hasDatabase()` → `demoOnly()`, `requireAdmin()`, `schema.parse(input)` (ошибка → `AdminRunResult` с текстом «Проверь поля»), вызов репозитория, `revalidateAdmin()`, сообщение об успехе. Ошибки — через существующий `toResult`.

- [ ] **Step 7: Чекпоинт**

Run: `npm run test:run` и `npm run typecheck`
Expected: зелёные.

---

### Task 15: Интерфейс админки

**Files:**
- Create: `app/(game)/admin/AdminTools.tsx`
- Modify: `app/(game)/admin/page.tsx`, `app/(game)/admin/AdminActions.tsx` (если нужно объединить), `app/globals.css`

**Interfaces:**
- Consumes: четыре действия из Task 14; `snapshot.players`, `snapshot.matches`, `listPendingForAdmin()`.
- Produces: `export function AdminTools({ enabled, players, matches, pending }: { enabled: boolean; players: PlayerView[]; matches: MatchView[]; pending: AdminPendingView[] })`.

- [ ] **Step 1: Формы**

Блок «Матч»: select матча, статус, счёт дома/гости, минута, кнопка «Сохранить». Блок «Кубики»: select игрока, тир, количество, причина, кнопка «Выдать». Блок «Ожидания»: список из `pending` (ник, тип, срок), у каждой строки кнопка «Закрыть безопасно». Блок «Роли»: select игрока и роли, кнопка «Сменить». Все кнопки `disabled={!enabled}` с подсказкой «Включится после подключения БД».

- [ ] **Step 2: Обратная связь**

Общий `useTransition`; результат каждого действия показывать в `Notice` над блоком; ошибки — тоном `danger`. После успеха — `router.refresh()`.

- [ ] **Step 3: Данные страницы**

В `admin/page.tsx` передать в `AdminTools` первые 20 матчей, всех игроков и `await listPendingForAdmin()`. Никаких запросов из клиента.

- [ ] **Step 4: Проверить**

В демо-режиме все кнопки отключены и объясняют почему. С `.env` (если появится) — правка счёта меняет `/matches`, выдача кубиков видна в лотке, роли — на `/participants`.

- [ ] **Step 5: Чекпоинт**

Run: `npm run typecheck` и `npm run test:run`
Expected: зелёные.

---

## Фаза 6. Арт

### Task 16: Фон карты и финальные иконки

**Files:**
- Modify: `components/map/MapScene.tsx`, `app/globals.css`, `public/art/mechanics/README.md` (дополнить фоном)
- Create: `public/art/map/README.md` (промпт фона)

**Interfaces:**
- `MapScene` рендерит `<div className="map-layer map-art" />` перед SVG; CSS `background-image: url('/art/map/map-night.webp')`, `background-size: 100% 100%`. Если файла нет — слой прозрачный, виден процедурный SVG.
- Иконки уже подключены через `MechanicArt`; при появлении файлов ничего менять не нужно.

- [ ] **Step 1: Слой фона**

Добавить `<div className="map-layer map-art" aria-hidden="true" />` первым ребёнком `MapScene`. CSS: `position: absolute; inset: 0; background-image: url('/art/map/map-night.webp'); background-size: 100% 100%; background-repeat: no-repeat; pointer-events: none;`. Никакого `onError` не нужно: отсутствующий файл просто не рисуется.

- [ ] **Step 2: Промпт фона**

`public/art/map/README.md`: 4096×2048, изометрия 2:1, зимний ночной футбольный городок, шесть участков по `docs/03 §3` (вход и трибуна, тренировочная база, чаша стадиона, тоннель, фан-зона, финиш), тёмная палитра `#0b141c`/`#16303f`, тёплые прожекторы `#ffc46b`, лаймовые акценты `#c8f25a`, без текста и логотипов, путь свободен от крупных объектов (по нему идут маркеры). Формат WebP ≤ 1.2 МБ.

- [ ] **Step 3: Контраст маркеров**

Проверить на будущем фоне: если маркеры теряются, добавить `.cell` тёмную подложку `background: radial-gradient(circle at 35% 25%, rgba(27,39,51,.92), rgba(11,20,28,.92))` — только после появления картинки, не раньше.

- [ ] **Step 4: Проверить оба состояния**

Без файла — процедурный фон как сейчас. Положить тестовую картинку 4096×2048 в `public/art/map/map-night.webp` — фон меняется, маркеры и путь поверх читаются. Удалить тестовую картинку после проверки.

- [ ] **Step 5: Финальный чекпоинт**

Run: `npm run test:run`, `npm run typecheck`, затем остановить dev, `npm run build`, снова `npm run dev`.
Expected: 235+ тестов зелёные, сборка проходит, dev поднимается.
