import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agents";

export const maxDuration = 600;

// POST /api/agents/call-synth { client }
// On-demand: read the client's FULL transcripts and (re)build the comprehensive call-insight
// synthesis (terminology/angles/objections/pains/quotes). Provider only — surfaces what's in
// the calls; does not write copy. Also runs nightly in daily_sync.
export async function POST(req: Request) {
  try {
    const { client } = await req.json();
    if (!client) return NextResponse.json({ error: "client (slug) is required" }, { status: 400 });
    const r = await runAgent("call_synth_agent.py", ["--client", String(client)]);
    return NextResponse.json({ ok: r.ok, output: r.output }, { status: r.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
