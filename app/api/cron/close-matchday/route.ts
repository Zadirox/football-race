/**
 * `GET /api/cron/close-matchday` — переходы статусов дня и авто-резолв
 * (docs/02 §4.1). Резолв идемпотентен: повторный прогон ничего не начислит
 * второй раз, `resolved_at` уже стоит.
 */

import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron/auth';
import { advanceMatchdays } from '@/lib/repo/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const report = await advanceMatchdays();

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
