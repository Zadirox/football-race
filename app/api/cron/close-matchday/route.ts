/**
 * `GET /api/cron/close-matchday` — переходы статусов дня и авто-резолв
 * (docs/02 §4.1). Резолв идемпотентен: повторный прогон ничего не начислит
 * второй раз, `resolved_at` уже стоит.
 */

import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron/auth';
import { closeDb } from '@/lib/db';
import { advanceMatchdays } from '@/lib/repo/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isConnectionEnded(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code;
  return code === 'CONNECTION_ENDED' || msg.includes('CONNECTION_ENDED');
}

async function run(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const report = await advanceMatchdays();

      if (report.errors.includes('CONFIG_MISSING')) {
        return NextResponse.json(report, { status: 503 });
      }
      if (!report.ok) {
        console.error('[close-matchday] failed', JSON.stringify(report));
        return NextResponse.json(report, { status: 500 });
      }

      return NextResponse.json(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isConnectionEnded(error) && attempt === 0) {
        console.warn('[close-matchday] connection ended, retrying once', message);
        await closeDb().catch(() => {});
        continue;
      }
      console.error('[close-matchday] exception', message);
      return NextResponse.json({ ok: false, reason: 'ERROR', error: message }, { status: 500 });
    } finally {
      await closeDb().catch(() => {});
    }
  }

  return NextResponse.json({ ok: false, reason: 'ERROR', error: 'retry exhausted' }, { status: 500 });
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
