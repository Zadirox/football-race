# Working State

## Current goal
2026-11-26: реализована фича по согласованному спека: batch-начисление бонусов карточек админом с дневным фильтром/чекбоксами/итоговым окном, история начислений игрока с бейджем и автооткрытием один раз при новых результатах, автосохранение составов. Миграция `0017_card_bonus_reports.sql` применена по явному подтверждению пользователя; commit/push выполняются по явному подтверждению.

## Completed
- Спек и план (uncommitted): `docs/superpowers/specs/2026-11-26-card-points-batch-and-lineup-autosave-design.md`, `docs/superpowers/plans/2026-11-26-card-points-batch-and-lineup-autosave.md`.
- **Task 1-2**: добавлены `supabase/migrations/0017_card_bonus_reports.sql`, типы отчётов в `lib/types.ts`, `lib/repo/card-bonus-reports.ts` (`normalizeCardBonusReportItemsForPlayer`), `lib/game/card-bonus-batch.ts` (решение batch, очки, коррекция, группировка). Тесты: `tests/unit/card-bonus-reports.test.ts`, `tests/unit/card-bonus-batch.test.ts`.
- **Task 3-4**: `lineupBonusBatchSubmitSchema` в `lib/actions/admin-schemas.ts`; batch submit в `lib/repo/admin-tools.ts` (транзакция: проверка видимых слотов, upsert `lineup_card_results`, upsert/delete `score_events` kind `lineup_bonus`, создание `card_bonus_reports`+items, audit). `listManualLineupBonusSlots` расширен фильтрами `day/includeProcessed`. Action `submitLineupBonusBatchAction` в `lib/actions/admin.ts`. Тесты: `tests/unit/admin-bonus-schemas.test.ts`.
- **Task 5**: `app/(game)/admin/AdminTools.tsx` переписан на дневной фильтр, чекбоксы (по умолчанию пустые, только активные видимые), одну кнопку «Отправить результат», обработанные/«Вернуть в очередь», итоговое модальное окно. `components/cards/CardBonusReportsModal.tsx` — модалки админ-итога и истории игрока.
- **Task 6**: `lib/repo/card-bonus-reports.ts` реализует чтение истории/seen и синтез исторических начислений из `lineup_card_results` (awarded-only, pre-feature включены). `lib/actions/card-bonus-reports.ts` — get/mark-seen actions. `components/cards/CardBonusReportsBadge.tsx` — бейдж в хедере, автооткрытие один раз при unseen, закрытие отмечает seen, история всегда доступна. Подключено в `components/shell/Header.tsx`.
- **Task 7**: `lib/game/lineup-autosave.ts` + `tests/unit/lineups-autosave.test.ts`; `app/(game)/lineups/LineupsClient.tsx` переведён на автосохранение: оптимистичное обновление, сериализация по слоту, статус сохранения/ошибка, откат при ошибке, без блокирующего `router.refresh()` на каждое сохранение, кнопка «Сохранить» убрана (оставлена «Убрать»).
- **Verification (2026-11-26)**: `npm run test:run -- tests/unit/card-bonus-reports.test.ts tests/unit/card-bonus-batch.test.ts tests/unit/admin-bonus-schemas.test.ts tests/unit/lineups-autosave.test.ts` PASS (4 files, 8 tests). `npx tsc --noEmit` PASS. `npm run test:run` PASS (36 files, 408 tests).

## Decisions confirmed (user, this task)
- 2026-11-26: V admin+player big modal; B batch submit applies to visible/filtered cards only; A badge next visit/refresh + persistent history access; A lineup autosave; A store report per submission; A checkboxes default empty (active queue only); A return-to-queue keeps old result until resubmit, correction creates history entry; A/A player history awarded-only and includes pre-feature historical awards; auto-open once on any game page next visit/refresh, close marks seen. Design approved, execution variant 2 (whole plan in this session) approved.

## Not done / risks / approvals pending
- `supabase/migrations/0017_card_bonus_reports.sql` применена в БД по явному подтверждению пользователя (2026-11-26). Commit/push выполняются по явному подтверждению; deploy отдельно не запрашивался/не выполнялся.
- Dirty/unrelated worktree items remain (pre-existing): `docs/superpowers/specs/2026-11-22-board-phase1-pack-choice-and-new-mechanics-design.md`, `lib/game/board.ts`, `tests/unit/board.test.ts`, `.playwright-mcp/`, `tmp/`, `клубы/`, `сборные/`.
- Manual UI smoke not run in this session (no live DB/dev server run). Needs check in real env: day filter, visible-only submit, summary modal, return-to-queue keeps points until resubmit/correction, player badge auto-open/seen/history, lineup autosave race/rollback behavior.
- Batch submit creates report items for both awarded and no-points decisions (admin/audit complete), player history filters awarded-only. Seen state is tracked per report; historical synthesized items use `hist:` ids and are not marked seen in DB.
- Player auto-open triggers on next visit/refresh when unseenCount>0; it marks seen on close by report ids. If user closes before mark-seen completes, next refresh may auto-open again (safe/idempotent).
- Previous ongoing concern remains: live sync recovery for stuck 24.11 matches (1635703,1635682,1635724) not confirmed after `6ae8f4a` deploy; sync prod issue is separate from this UI/lineup work.

## Next step
- Get explicit separate user approval before any of: `git commit`, `git push`, deploy, or applying `supabase/migrations/0017_card_bonus_reports.sql`.
- After approval, apply migration 0017 in target DB, deploy code, then run manual smoke in prod/dev: admin batch submit (day filter, visible-only, processed/return-to-queue), player badge/modal/history, lineup autosave.
- Separately confirm post-`6ae8f4a` sync recovery for stuck matches 1635703/1635682/1635724.