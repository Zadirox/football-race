# Промпты для иконок механик

18 картинок для карточки клетки. Каждый промпт — готовый к вставке в генератор.
Файл кладётся в эту папку под именем из заголовка, код совпадает с
`lib/game/catalog.ts`.

## Общие правила

- Размер: 512×512, PNG, прозрачный фон.
- Один предмет в кадре, по центру, заполняет ~70% высоты.
- Стиль: плоская изометрия, мягкий свет сверху слева, без текста.
- Обводка и тени — `#0b141c`; металл — `#8fa6b8`; снег/блики — `#e8f0f6`.
- Акцентный цвет зависит от полярности:
  - позитив (`01`, `03`, `05`, `06`, `10`) — лайм `#c8f25a`;
  - негатив (`02`, `04`, `08`) — терракота `#e4573d`;
  - ловушка (`09`, `15`) — янтарь `#ffc46b`;
  - нейтрально (`07`, `13`, `14`, `17`, `18`) — сталь `#8fa6b8`;
  - необязательные (`11`, `12`, `16`) — свой акцент из промпта.
- Негативный промпт общий, в конце страницы.

## 01.png — Контратака (позитив)

```
flat isometric game icon of a football with a bold motion arrow curving
forward, lime accent #c8f25a on the arrow and ball highlight, dark navy
outline #0b141c, muted slate #8fa6b8 details, soft light from top-left,
clean transparent background, centered single object, 512x512, no text
```

## 02.png — Офсайд (негатив)

```
flat isometric game icon of an assistant referee flag raised up, terracotta
#e4573d flag cloth, dark navy outline #0b141c, muted slate #8fa6b8 pole,
soft light from top-left, clean transparent background, centered single
object, 512x512, no text
```

## 03.png — Голевая передача (позитив)

```
flat isometric game icon of a football passing along a dotted lime #c8f25a
trajectory, small arrow at the end of the arc, dark navy outline #0b141c,
muted slate #8fa6b8 ball panels, soft light from top-left, clean transparent
background, centered single object, 512x512, no text
```

## 04.png — Скользкий газон (негатив)

```
flat isometric game icon of a sliding tackle mark on wet grass, two parallel
cleat streaks cut into dark green turf, terracotta #e4573d warning glint on
the wet edge, dark navy outline #0b141c, soft light from top-left, clean
transparent background, centered single object, 512x512, no text
```

## 05.png — Домашние трибуны (позитив)

```
flat isometric game icon of a small stadium stand with warm floodlights,
lime #c8f25a light beams rising from the lamps, dark navy outline #0b141c,
muted slate #8fa6b8 seats, warm amber #ffc46b glow, soft light from top-left,
clean transparent background, centered single object, 512x512, no text
```

## 06.png — Щитки (позитив)

```
flat isometric game icon of a pair of football shin pads, lime #c8f25a
protective shell with one small shield emblem shape, dark navy outline
#0b141c, muted slate #8fa6b8 straps, soft light from top-left, clean
transparent background, centered single object, 512x512, no text
```

## 07.png — Раздевалка (нейтрально)

```
flat isometric game icon of a locker room bench with a hanging jersey,
steel #8fa6b8 bench and hook, dark navy outline #0b141c, folded white towel,
soft light from top-left, clean transparent background, centered single
object, 512x512, no text
```

## 08.png — Жёлтая карточка (негатив)

```
flat isometric game icon of a yellow referee card held up by a gloved hand,
terracotta #e4573d shadow under the card, dark navy outline #0b141c, muted
slate #8fa6b8 glove, soft light from top-left, clean transparent background,
centered single object, 512x512, no text
```

## 09.png — VAR (ловушка)

```
flat isometric game icon of a monitor showing a replay frame with a target
reticle, amber #ffc46b reticle and screen glow, dark navy outline #0b141c,
muted slate #8fa6b8 stand, abstract green pitch fragment on screen, soft
light from top-left, clean transparent background, centered single object,
512x512, no text
```

## 10.png — Тактическая схема (позитив)

```
flat isometric game icon of a tactics board with arrows and player dots,
lime #c8f25a arrows, dark navy outline #0b141c, muted slate #8fa6b8 board
frame and round magnets, white pitch markings, soft light from top-left,
clean transparent background, centered single object, 512x512, no text
```

## 11.png — Тренировочная база (необязательная)

```
flat isometric game icon of a football in front of a small training goal,
lime #c8f25a net highlights, dark navy outline #0b141c, muted slate #8fa6b8
goal frame, light snow at the base, soft light from top-left, clean
transparent background, centered single object, 512x512, no text
```

## 12.png — Узнай футболиста (необязательная)

```
flat isometric game icon of a footballer silhouette behind a large question
mark, amber #ffc46b question mark, dark navy outline #0b141c, muted slate
#8fa6b8 silhouette, soft light from top-left, clean transparent background,
centered single object, 512x512, no text
```

## 13.png — Фан-сектор (нейтрально)

```
flat isometric game icon of a fan scarf and a stadium flag, steel #8fa6b8
and faded club colors, amber #ffc46b tassels, dark navy outline #0b141c,
soft light from top-left, clean transparent background, centered single
object, 512x512, no text
```

## 14.png — Ответный матч (нейтрально)

```
flat isometric game icon of a penalty spot with a ball and a whistle,
steel #8fa6b8 whistle, dark navy outline #0b141c, white pitch chalk circle,
soft light from top-left, clean transparent background, centered single
object, 512x512, no text
```

## 15.png — Последняя минута (ловушка)

```
flat isometric game icon of a stopwatch with a glowing amber #ffc46b dial,
hand near the final mark, dark navy outline #0b141c, muted slate #8fa6b8
case, soft light from top-left, clean transparent background, centered
single object, 512x512, no text
```

## 16.png — Симуляция (необязательная)

```
flat isometric game icon of a single composition with a theatre mask over a
football boot, amber #ffc46b mask, dark navy outline #0b141c, muted slate
#8fa6b8 boot, soft light from top-left, clean transparent background,
512x512, no text
```

## 17.png — Контракт тренера (нейтрально)

```
flat isometric game icon of a whistle resting on a signed paper sheet,
steel #8fa6b8 whistle, dark navy outline #0b141c, abstract signature line
without letters, soft light from top-left, clean transparent background,
centered single object, 512x512, no text
```

## 18.png — Джентльменское соглашение (нейтрально)

```
flat isometric game icon of two hands shaking over a football, steel
#8fa6b8 hands, lime #c8f25a thin agreement glow between the palms, dark navy
outline #0b141c, soft light from top-left, clean transparent background,
centered single object, 512x512, no text
```

## Негативный промпт (для всех)

```
text, letters, numbers, watermark, signature, photo, photorealistic, 3d render,
noisy background, frame, border, multiple objects, human face, logo, brand mark,
harsh shadows, neon glow, clutter
```

## Проверка

1. Положить файл в `public/art/mechanics/` с именем из заголовка.
2. Открыть карту и навести на событийную клетку — картинка в карточке.
3. Нет файла — остаётся SVG-заглушка, карточка не ломается.
4. Если предмет «плавает» — уменьшить отступы вокруг объекта на 10–15%.
