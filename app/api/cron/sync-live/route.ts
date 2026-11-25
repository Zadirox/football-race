import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron/auth";
import { closeDb } from "@/lib/db";
import { syncFixtures } from "@/lib/repo/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Live sync: only in-scope started/live/soon matches. Safe under cron-job.org 30s.
const CRON_BUDGET_MS = 24_000;

function isConnectionEnded(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code;
  return code === "CONNECTION_ENDED" || msg.includes("CONNECTION_ENDED");
}

async function run(request: Request): Promise<Response> {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const report = await syncFixtures({ budgetMs: CRON_BUDGET_MS, mode: "live" });

      if (report.reason === "CONFIG_MISSING") {
        return NextResponse.json(report, { status: 503 });
      }
      if (report.reason === "SYNC_QUOTA_EXCEEDED") {
        console.warn("[sync-live] quota exceeded", JSON.stringify(report));
        return NextResponse.json(report, { status: 429 });
      }
      if (!report.ok) {
        console.error("[sync-live] failed", JSON.stringify(report));
        return NextResponse.json(report, { status: 502 });
      }

      return NextResponse.json(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isConnectionEnded(error) && attempt < 2) {
        console.warn(`[sync-live] connection ended, retrying (${attempt + 1}/2)`, message);
        await closeDb().catch(() => {});
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      console.error("[sync-live] exception", message);
      return NextResponse.json({ ok: false, reason: "ERROR", error: message }, { status: 500 });
    } finally {
      await closeDb().catch(() => {});
    }
  }

  return NextResponse.json({ ok: false, reason: "ERROR", error: "retry exhausted" }, { status: 500 });
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
