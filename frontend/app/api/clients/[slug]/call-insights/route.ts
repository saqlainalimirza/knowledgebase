import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clients/{slug}/call-insights
// Whole-call synthesis: terminology, angles, objections, pains, dream outcomes and notable
// quotes read from the FULL transcripts (not query-bounded chunk search). The answer to
// "tell me what's actually in these calls" without having to guess the right search queries.
// Built by agents/call_synth_agent.py; rebuild on demand via POST /api/agents/call-synth.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  try {
    const row = await one<any>(
      `select terminology, angles, objections, pains, dream_outcomes, notable_quotes,
              summary, n_calls, source_call_ids, refreshed_at
       from call_insights where client_slug=$1`,
      [slug],
    );
    if (!row) {
      return NextResponse.json({
        client: slug,
        available: false,
        note: "No call-insight synthesis yet. Trigger it with POST /api/agents/call-synth {client}, " +
              "or it runs nightly once the client has transcripts.",
      });
    }
    return NextResponse.json({ client: slug, available: true, ...row });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
