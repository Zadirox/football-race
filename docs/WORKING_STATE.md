# Working State

## Current goal
2026-11-28: стабилизация после легендарного видео — фикс пропадающей live-статистики и превентивное улучшение синхронизации клубных соревнований; ожидается commit/push по явному подтверждению.

## Completed
- **Legendary club reveal video (2026-11-27)**: `components/cards/PackOpenReveal.tsx` + `public/videos/legendary-reveals/` (29 mp4) + `public/packs/` art. Коммиты: `7b9c042`, `6c0a22a`, `f43b9ed`.
- **Prod bugfix legendary video (2026-11-27, committed/pushed `9399783`)**: probe timeout очищался после успешного metadata, из-за чего видео считалось недоступным до рейтинга; фикс — cleanup очищает timeout, timeout увеличен до 12s.
- **Live stats wipe fix (2026-11-28, local, user approved code fix)**: `lib/repo/sync.ts` `quickUpdateInScopeMatch` больше не затирает minute/stats null-значениями из fallback-обновления; использует `coalesce` для minute и подробной статистики. Проверки: `npx tsc --noEmit` OK, `npm run test:run` 37 files / 411 tests.
- **Club sync resilience (2026-11-28, local, user approved option A)**: `lib/repo/sync.ts` — перед club sync приоритизирует comps без матчей в окне, делает одну короткую повторную попытку после таймаута/ошибки, логирует добор/неуспех. Проверки: `npx tsc --noEmit` OK, `npm run test:run` 37 files / 411 tests.
- **Test legendary packs (2026-11-27, explicit DB approvals)**: выданы временные гарантированные клубные легендарные паки (`pack 00000000-0000-0000-0000-00000000a999`) Малеку, Клыку, Димасику, Серхио; по подтверждениям удалены тестовые карточки из этих открытий, включая 4 карточки от 27.11 (Клык — João Neves, Димасик — Dayot Upamecano, Серхио — Bruno Fernandes и Vinícius Júnior).

## Decisions confirmed (user, this task)
- 2026-11-27: легендарное видео A/A/A/A, только клубные легендарные; без пропуска во время видео; после видео — карточка + легендарный звук; запуск ~1.5с после фиксации рейтинга. Pack art C/B/A. Явные подтверждения на commit/push `7b9c042`,`6c0a22a`,`f43b9ed`,`9399783`.
- 2026-11-27: явные подтверждения на DB-выдачу/удаление тестовых легендарных паков/карточек для Малека, Клыка, Димасика, Серхио и удаление 4 карточек от 27.11.
- 2026-11-28: явное подтверждение «Да, исправляй код» для фикса пропадающей статистики.
- 2026-11-28: выбран вариант A для предотвращения пропуска матчей синхронизацией; явное подтверждение «да, делай фикс синхронизации».
- 2026-11-28: явное подтверждение «да, коммичу и пушу оба фикса» (stats + sync).

## Not done / risks / approvals pending
- `lib/repo/sync.ts` содержит два локальных фикса (stats + club sync), commit/push выполняется сейчас по явному подтверждению.
- Betis-Rayo (sstats 1570463, in-scope 2026-11-28) был найден с обнулённой подробной статистикой из-за fallback wipe; фикс предотвращает повтор, но уже обнулённые данные восстановятся только после успешного sync/propagation.
- Причина отсутствия матча Баварии 28.11: в БД нет Bayern match 27–29.11, в логах sync видны таймауты BL1 и пропуски comps по бюджету — вероятная причина, но 100% не подтверждена без внешнего источника. Новый фикс снижает риск, не гарантирует.
- Временный тестовый пак `00000000-0000-0000-0000-00000000a999` и выданные grants остаются в БД; удалять только по явному подтверждению.
- Dirty/unrelated worktree items remain (не трогать): `docs/superpowers/specs/2026-11-22-board-phase1-pack-choice-and-new-mechanics-design.md`, `lib/game/board.ts`, `tests/unit/board.test.ts`, `.playwright-mcp/`, `tmp/`, `клубы/`, `сборные/`, `public/packs/*.orig.png`.

## Next step
- Закоммитить и запушить оба фикса в `lib/repo/sync.ts` (и обновлённый `docs/WORKING_STATE.md`) по уже полученному явному подтверждению.
- После деплоя проверить live-статистику на проблемных матчах и мониторить sync_runs на пропуски club comps.
