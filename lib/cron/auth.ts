/**
 * Защита cron-роутов. `CRON_SECRET` приходит либо заголовком
 * `Authorization: Bearer …` (так шлёт Vercel Cron), либо параметром
 * `?secret=…` для ручного запуска и pg_cron.
 *
 * Без секрета роут закрыт: лучше не выполнить синк, чем дать любому
 * желающему дёргать провайдера и тратить квоту.
 */

import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function cronAuthorized(request: Request): boolean {
  const secret = serverEnv().cronSecret;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (bearer && safeEqual(bearer, secret)) return true;

  const fromQuery = new URL(request.url).searchParams.get('secret');
  return fromQuery !== null && safeEqual(fromQuery, secret);
}
