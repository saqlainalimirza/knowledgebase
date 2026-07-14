import { NextResponse } from "next/server";
import { fireDailySync } from "@/lib/cron";

// Manual trigger for the daily sync (fire-and-forget; check /api/cron/status).
// If CRON_SECRET is set in the environment, ?key=<secret> is required.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = new URL(req.url).searchParams.get("key");
    if (key !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const only = new URL(req.url).searchParams.get("only") || undefined;
  const r = fireDailySync(only);
  return NextResponse.json(r, { status: r.started ? 202 : 409 });
}
