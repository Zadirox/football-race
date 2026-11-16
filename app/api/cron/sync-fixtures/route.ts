/**
 * `GET /api/cron/sync-fixtures` — синк фикстур, счёта и статистики (docs/02 §2.1).
 *
 * Запуск: cron-job.org / внешний планировщик (желательно каждые 1–3 минуты) или руками с секретом.
 * Прогон идемпотентный и ограничен по времени: за один вызов делает часть работы и возвращает отчёт,
 * поэтому регулярные вызовы постепенно подтягивают данные и дозасчитывают предикты без ручных правок.
 */

import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron/auth';
import { syncFixtures } from '@/lib/repo/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_BUDGET_MS = 45_000;

async function run(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const report = await syncFixtures({ budgetMs: CRON_BUDGET_MS });

  if (report.reason === 'CONFIG_MISSING') {
    return NextResponse.json(report, { status: 503 });
  }
  if (report.reason === 'SYNC_QUOTA_EXCEEDED') {
    console.warn('[sync-fixtures] quota exceeded', JSON.stringify(report));
    return NextResponse.json(report, { status: 429 });
  }
  if (!report.ok) {
    console.error('[sync-fixtures] failed', JSON.stringify(report));
    return NextResponse.json(report, { status: 502 });
  }

  return NextResponse.json(report);
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
