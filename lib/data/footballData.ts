/**
 * Клиент football-data.org v4 — основной источник фикстур и счёта
 * (docs/02 §2). Один запрос `/matches` на окно дат: фильтр по турнирам
 * делаем локально, чтобы не тратить квоту и не зависеть от тарифа.
 *
 * Клиент ничего не пишет в БД и не знает про игру: только HTTP + разбор
 * ответа. Нормализация — в `normalize.ts`, запись — в `lib/repo/sync.ts`.
 */

import { AppError } from '@/lib/errors';
import type { ProviderMatch } from './normalize';

const BASE_URL = 'https://api.football-data.org/v4';
const TIMEOUT_MS = 15_000;

export type FixtureFetch = {
  matches: ProviderMatch[];
  httpStatus: number;
  durationMs: number;
  /** Сколько запросов к провайдеру потратили (всегда 1 при успехе). */
  requestsUsed: number;
};

type MatchesResponse = { matches?: ProviderMatch[] };

/**
 * Забирает матчи за окно дат (`YYYY-MM-DD`, границы включительно).
 * 429 — отдельный код квоты, остальные ошибки — «провайдер недоступен»,
 * чтобы вызывающий мог записать это в `sync_runs` и жить на кэше.
 */
export async function fetchFixtures(input: {
  token: string;
  from: string;
  to: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<FixtureFetch> {
  const url = new URL(`${BASE_URL}/matches`);
  url.searchParams.set('dateFrom', input.from);
  url.searchParams.set('dateTo', input.to);

  const doFetch = input.fetchImpl ?? fetch;
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await doFetch(url, {
      headers: { 'X-Auth-Token': input.token },
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(2_000, Math.min(input.timeoutMs ?? TIMEOUT_MS, 20_000))),
    });
  } catch (error) {
    throw new AppError('SYNC_PROVIDER_DOWN', `Провайдер не ответил: ${(error as Error).message}`);
  }

  const durationMs = Date.now() - startedAt;

  if (response.status === 429) {
    throw new AppError('SYNC_QUOTA_EXCEEDED');
  }
  if (!response.ok) {
    throw new AppError('SYNC_PROVIDER_DOWN', `Провайдер вернул ${response.status}`);
  }

  let payload: MatchesResponse;
  try {
    payload = (await response.json()) as MatchesResponse;
  } catch {
    throw new AppError('SYNC_PROVIDER_DOWN', 'Провайдер вернул не JSON');
  }

  return {
    matches: Array.isArray(payload.matches) ? payload.matches : [],
    httpStatus: response.status,
    durationMs,
    requestsUsed: 1,
  };
}

/** Точечный fetch одного матча по ID (для refresh, когда /matches window не возвращает обновление). */
export async function fetchFootballDataMatch(input: {
  token: string;
  matchId: string | number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ match: ProviderMatch | null; httpStatus: number; requestsUsed: number }> {
  const url = `${BASE_URL}/matches/${encodeURIComponent(String(input.matchId))}`;
  const doFetch = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, {
      headers: { 'X-Auth-Token': input.token },
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(2_000, Math.min(input.timeoutMs ?? TIMEOUT_MS, 20_000))),
    });
  } catch (error) {
    throw new AppError('SYNC_PROVIDER_DOWN', `Провайдер не ответил: ${(error as Error).message}`);
  }
  if (response.status === 429) throw new AppError('SYNC_QUOTA_EXCEEDED');
  if (!response.ok) throw new AppError('SYNC_PROVIDER_DOWN', `Провайдер вернул ${response.status}`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppError('SYNC_PROVIDER_DOWN', 'Провайдер вернул не JSON');
  }
  const match = payload && typeof payload === 'object' && 'id' in (payload as any) ? (payload as ProviderMatch) : null;
  return { match, httpStatus: response.status, requestsUsed: 1 };
}
