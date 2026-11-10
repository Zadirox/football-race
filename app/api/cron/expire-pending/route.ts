/**
 * `GET /api/cron/expire-pending` — авто-закрытие брошенных ожиданий
 * (DECISIONS D7). Vercel Cron раз в 15 минут, pg_cron или руками с секретом.
 *
 * Игрок, закрывший вкладку на VAR, тактике, раздевалке или передаче,
 * не блокирует себе броски навсегда: судья решает за него.
 */

import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron/auth';
import { expirePending } from '@/lib/repo/pending';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const report = await expirePending();

  if (report.errors.includes('CONFIG_MISSING')) {
    return NextResponse.json(report, { status: 503 });
  }
  if (!report.ok) {
    return NextResponse.json(report, { status: 500 });
  }

  return NextResponse.json(report);
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
