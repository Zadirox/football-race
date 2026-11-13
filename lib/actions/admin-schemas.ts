/**
 * Схемы админских правок (Task 14).
 *
 * Живут отдельно от `'use server'`-модуля, чтобы проверяться юнит-тестами
 * без Next-рантайма. Формы присылают строки, поэтому числовые поля
 * приводятся к number: пустая строка — это `null`, а не ноль.
 */

import { z } from 'zod';

export const MATCH_STATUSES = ['NS', 'LIVE', 'HT', 'FT', 'PST', 'CANC', 'ABD'] as const;
export const DICE_TIERS = ['wood', 'bronze', 'silver', 'gold'] as const;
export const ROLES = ['admin', 'player', 'spectator'] as const;

/** Пустое поле ввода → `null`; строка с числом → number; иначе как есть. */
function nullableInt(min: number, max: number) {
  return z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return null;
    if (typeof value === 'string') return Number(value);
    return value;
  }, z.number().int().min(min).max(max).nullable());
}

export const matchUpdateSchema = z.object({
  matchId: z.uuid(),
  status: z.enum(MATCH_STATUSES),
  homeScore: nullableInt(0, 99),
  awayScore: nullableInt(0, 99),
  minute: nullableInt(0, 130),
});

export type MatchUpdateInput = z.infer<typeof matchUpdateSchema>;

export const diceGrantSchema = z.object({
  profileId: z.uuid(),
  tier: z.enum(DICE_TIERS),
  count: z.coerce.number().int().min(1).max(10),
  reason: z.string().trim().min(3).max(200),
});

export type DiceGrantInput = z.infer<typeof diceGrantSchema>;

export const pendingCloseSchema = z.object({
  pendingId: z.uuid(),
});

export type PendingCloseInput = z.infer<typeof pendingCloseSchema>;

export const roleChangeSchema = z.object({
  profileId: z.uuid(),
  role: z.enum(ROLES),
});

export type RoleChangeInput = z.infer<typeof roleChangeSchema>;

const gameDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Формат даты: ГГГГ-ММ-ДД');

export const syncFixturesSchema = z
  .object({
    from: gameDateString.optional(),
    to: gameDateString.optional(),
  })
  .optional()
  .refine((value) => {
    if (!value) return true;
    const hasFrom = Boolean(value.from);
    const hasTo = Boolean(value.to);
    if (hasFrom !== hasTo) return false;
    if (value.from && value.to) return value.from <= value.to;
    return true;
  }, { message: 'Укажи обе даты периода, и начало не позже конца' });

export type SyncFixturesInput = z.infer<typeof syncFixturesSchema>;
