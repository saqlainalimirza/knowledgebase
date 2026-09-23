import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clients/{slug}/learnings?status=confirmed
// Durable learnings distilled from real A/B performance (by learnings_agent, nightly).
// confirmed first (metric-backed at 'ok' confidence); 'proposed' are directional, awaiting a human ok.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const status = new URL(req.url).searchParams.get("status");
  try {
    const rows = await q<any>(
      `select id, campaign_id, dimension, winner_value, loser_value, metric,
              winner_n, loser_n, delta_pp, confidence, status, statement, evidence, refreshed_at
       from learnings
       where client_slug=$1 and active ${status ? "and status=$2" : ""}
       order by (status='confirmed') desc, delta_pp desc nulls last, refreshed_at desc`,
      status ? [slug, status] : [slug],
    );
    return NextResponse.json({ client: slug, count: rows.length, learnings: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
