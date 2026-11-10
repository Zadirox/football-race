/**
 * `GET /api/cron/sync-fixtures` — синк фикстур и счёта (docs/02 §2.1).
 *
 * Запуск: Vercel Cron каждые 3 часа, pg_cron или руками с секретом.
 * Один прогон = один запрос к провайдеру, поэтому квота не горит.
 */

import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron/auth';
import { syncFixtures } from '@/lib/repo/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const report = await syncFixtures();

  if (report.reason === 'CONFIG_MISSING') {
    return NextResponse.json(report, { status: 503 });
  }
  if (report.reason === 'SYNC_QUOTA_EXCEEDED') {
    return NextResponse.json(report, { status: 429 });
  }
  if (!report.ok) {
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
