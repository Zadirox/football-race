# Клетки A+B — Батч 1: «Последняя минута» (механика 15)

**Дата:** 2026-11-23  
**Статус:** Черновик на согласование  
**Область:** Батч 1 программы A (механики 11–18). B (Phase 1, 19+21–37) — быстрый аудит пройден, базовые тесты зелёные; полный аудит B выполняется перед/в рамках дальнейших батчей при необходимости.

## Контекст и согласованные решения

- Пользователь выбрал программу **A+B**: A = вторая волна 11–18, B = проверка/добивка Phase 1.
- A делаем **батчами**: `15` → `14/16/18` → `11/12/13/17` (порядок из Phase 1 spec).
- **Размещение на живой карте отложено**: механики реализуются в engine/catalog/UI/actions/tests, но не ставятся на live board/cells до отдельного согласования слотов и DB-обновления.
- B быстрый аудит: `tests/unit/engine.test.ts`, `tests/unit/board.test.ts`, `tests/unit/cards.test.ts` — 92/92 PASS. Явных дыр не видно; полный стыковой аудит не проводился.

## Цель батча 1

Реализовать механику **15 «Последняя минута»** (docs/04-mechanics §15, catalog 15: `kind=choice`, `polarity=trap`, `application=choice`, `core=false`) как полностью рабочий pending-choice flow, без размещения на live board.

## Поведение (источник: docs/04-mechanics.md §15)

> Push-your-luck: старт `+1`. Продолжить → 60%: `+3`, 40%: `0`. Ещё раз → 40%: `+5`, 60%: `0`. Можно остановиться и забрать текущее. Провал обнуляет только награду события, прошлые награды и кубики не отнимаются. Вероятности видны заранее.

Уточнения, принятые в этом батче (согласовано пользователем):

- **Модель pending:** один `pending_actions` на событие, состояние этапа в payload (`kind='last_minute'`, `stage`, `currentReward`). Выбор A.
- **Таймаут/expiry:** если игрок не ответил в 24h, применяется безопасная ветка — **автоматически забрать текущую награду**. Выбор A. Лог: «судья решил за него: забирает текущую награду».
- **Применение награды:** награда не применяется сразу при попадании на клетку. Она применяется только когда игрок останавливается, получает финальный результат шага, или срабатывает expiry. Это соответствует существующему паттерну choice-механик (penalty/dribble): движение — результат разрешения choice.
- **Провал:** награда события = 0, позиция не меняется этим событием (клетка, на которую попали кубиком, остаётся местом события; дополнительного движения нет).
- **Блокировка:** пока pending открыт, следующий бросок заблокирован обычным правилом pending_actions.
- **Риск добровольный:** Щитки не защищают от плохого исхода (аналогично VAR/penalty/dribble risk). Это соответствует описанию «провал обнуляет только награду события» и общему правилу добровольного риска.

## Дизайн

### Engine (`lib/game/engine.ts`)

- Добавить `CellChoice`/awaiting kind `last_minute`.
- `case '15'` в `resolveCell`: не двигает игрока, возвращает `awaiting: 'last_minute'`, лог с объяснением старта +1 и вероятностей/выбора. `delta: 0`, `state` без движения.
- Чистая функция разрешения, например `applyLastMinute(state, choice, stage, currentReward, random)`:
  - `choice='stop'` → `moveBy(state, currentReward)` если reward>0, иначе state без движения; лог «забрал +N».
  - `choice='continue'`, `stage=1`, `currentReward=1` → random < 0.6 ? advance to stage2 with currentReward=3 (still pending) : fail reward 0 resolved.
  - `choice='continue'`, `stage=2`, `currentReward=3` → random < 0.4 ? resolve with +5 : fail reward 0.
- Для продолжения без финального разрешения нужен способ вернуть «pending продолжается» с обновлённым payload. Варианты реализации: отдельный тип результата или расширение `CellOutcome`/отдельный return shape для apply-функции. Конкретная форма — деталь плана; инвариант: один pending, payload обновляется, cell_event не закрывается до финала.

### Pending/Expiry

- `lib/game/pending-expiry.ts`: добавить `last_minute` в expirable kinds и `expiryDecision` → safe take-current. Нужен доступ к `currentReward` из payload pending.
- `lib/repo/pending.ts`: при expire для `last_minute` читать payload.currentReward и применять движение + лог + close pending + resolve cell_event.
- `lib/repo/game-tx.ts` / `lib/repo/pending.ts`: убедиться, что payload обновляется при переходе stage 1→2 (pending остаётся открытым).

### Actions (`lib/actions/game.ts`)

- Новый server action `chooseLastMinuteAction({ pendingId, choice: 'stop'|'continue' })`.
- Валидация: pending принадлежит viewer, kind `last_minute`, не истёк, не resolved.
- `choice='stop'`: применить текущую награду, записать движение/state, лог, close pending, resolve cell_event.
- `choice='continue'`: RNG серверный; либо закрыть с финальным результатом (успех stage2 / провал), либо обновить pending payload на stage2/currentReward=3 и оставить открытым.
- Идемпотентность: повторный запрос на закрытый pending → безопасная ошибка как обычно.

### Types / UI

- `lib/types.ts`: добавить `last_minute` в pending kind union.
- `components/map/GameHud.tsx`: отрисовать pending modal для `last_minute` с текущей наградой, вероятностями следующего шага, кнопками «Забрать +N» / «Рискнуть». После continue на stage2 — показать обновлённый текущий reward и новые вероятности.
- Demo mode: поддержать локальный выбор, если demo flow используется для этого pending (проверить существующий паттерн).

### Board

- **Не менять** `generateReworkedBoard`, `generateBoard` веса, live cells. Механика должна быть разрешаема движком при попадании на cell с `mechanic_code='15'`, но размещение — отдельное согласование.

### Tests

- `tests/unit/engine.test.ts`: case 15 creates awaiting last_minute; stop on stage1 gives +1; continue stage1 success -> stage2 pending; continue stage1 fail -> 0; continue stage2 success -> +5; continue stage2 fail -> 0; probabilities via injected random; no shield interaction (voluntary risk) — если применимо по текущей модели.
- `tests/unit/pending-expiry.test.ts` (или существующий): expiry last_minute takes current reward.
- Repo/action tests по существующему паттерну (если есть инфраструктура) для idempotency/reload safety.
- `npm run test:run`, `npm run typecheck` перед завершением батча.

## Не входит в батч 1

- Размещение 15 на live/reworked board.
- Механики 11–14, 16–18.
- Любые новые DB migrations, если можно обойтись существующей схемой pending_actions/cell_events (payload jsonb уже есть). Если потребуется migration — отдельное согласование.

## Риски

- **Многошаговый pending:** нужно аккуратно не закрыть cell_event/pending на промежуточном шаге. 
- **Expiry payload:** текущий expiryDecision не получает payload; нужно расширить сигнатуру безопасно.
- **UI состояние после continue:** нужно обновить snapshot/pending после stage transition.
- **Demo parity:** если demo-mode поддерживает pending choices, нужно не забыть last_minute.

## Критерии приёмки

- Попадание на клетку с mechanic 15 создаёт pending `last_minute` stage1/currentReward=1, бросок заблокирован.
- Игрок видит текущую награду, вероятности, может забрать или рискнуть.
- Stop/continue/fail/success дают результаты 0/1/3/5 по спеке; движение применяется только при финальном разрешении.
- Reload сохраняет pending и текущий этап/награду.
- Таймаут 24h автоматически забирает текущую награду и пишет лог.
- Тесты и typecheck проходят; live board не изменён.