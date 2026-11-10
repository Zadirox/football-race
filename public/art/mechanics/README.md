# Иконки механик

Карточка клетки берёт картинку по коду механики из `lib/game/catalog.ts`.
Файл `01.png` появился — иконка заменилась без правок кода. Нет файла —
рисуется SVG-заглушка в палитре игры (круг, номер, цвет полярности).

## Формат

- Файл: `NN.png`, где `NN` — код механики (`01` … `18`).
- Размер: 512×512, PNG с прозрачным фоном.
- Один предмет в кадре, по центру, заполняет ~70% высоты.
- Стиль: плоская изометрия, мягкий свет сверху слева, без текста.

## Палитра

| Токен | Цвет | Где |
|---|---|---|
| Ночь | `#0b141c` | контур, тени |
| Металл | `#8fa6b8` | нейтральные предметы |
| Лайм | `#c8f25a` | позитив, акценты |
| Янтарь | `#ffc46b` | ловушки, свет |
| Терракота | `#e4573d` | негатив |
| Снег | `#e8f0f6` | блики |

## Промпт-шаблон

```
flat isometric game icon of <SUBJECT>, centered, single object, dark navy
outline #0b141c, muted slate #8fa6b8, lime accent #c8f25a, warm amber #ffc46b,
soft light from top-left, clean transparent background, 512x512, no text
```

Негативный промпт (общий для всех):

```
text, letters, numbers, watermark, signature, photo, photorealistic, 3d render,
noisy background, frame, border, multiple objects, human face
```

## Список

| Код | Механика | Предмет (`<SUBJECT>`) |
|---|---|---|
| 01 | Контратака | a football with a motion arrow curving forward |
| 02 | Офсайд | an assistant referee flag raised up |
| 03 | Голевая передача | a football passing along a dotted trajectory |
| 04 | Скользкий газон | a sliding tackle mark on wet grass |
| 05 | Домашние трибуны | a stadium stand with warm floodlights |
| 06 | Щитки | a pair of shin pads |
| 07 | Раздевалка | a locker room bench with a hanging jersey |
| 08 | Жёлтая карточка | a yellow referee card held up |
| 09 | VAR | a monitor showing a replay frame with a target reticle |
| 10 | Тактическая схема | a tactics board with arrows and player dots |
| 11 | Тренировочная база | a football and a training goal |
| 12 | Узнай футболиста | a footballer silhouette behind a question mark |
| 13 | Фан-сектор | a scarf and a fan flag |
| 14 | Ответный матч | a penalty spot with a ball and a whistle |
| 15 | Последняя минута | a stopwatch with a glowing dial |
| 16 | Симуляция | a theatre mask next to a football boot |
| 17 | Контракт тренера | a whistle on a signed paper sheet |
| 18 | Джентльменское соглашение | two hands shaking over a football |

## Проверка

1. Положить файлы в эту папку с именами из таблицы.
2. Открыть карту, навести на событийную клетку: в карточке видна картинка.
3. Если файла нет — остаётся заглушка, карточка не ломается.
