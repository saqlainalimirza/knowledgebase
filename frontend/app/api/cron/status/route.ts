import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Last sync runs: when data was last refreshed and whether it succeeded.
export async function GET() {
  try {
    const rows = await q(
      `select id, started_at, finished_at, ok, summary
       from sync_log order by id desc limit 10`
    );
    return NextResponse.json({ runs: rows });
  } catch {
    return NextResponse.json({ runs: [], note: "no sync has run yet" });
  }
}
