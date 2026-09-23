import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agents";

export const maxDuration = 120;

// POST /api/benchmark-copy  { client?, t1, t2?, limit? }
// Scores a DRAFT against Evergreen's real winners & losers: returns nearest winners
// (with positive_rate/booked), nearest losers (with why_it_failed), similarity, and a
// KEEP/REWORK/DROP/TEST verdict. The campaign-director fires this on every draft so a
// draft that mirrors a known loser is caught before it ships. Provider only — no copy written.
export async function POST(req: Request) {
  try {
    const { client, t1, t2, limit } = await req.json();
    if (!t1?.trim())
      return NextResponse.json({ error: "t1 (the draft opener) is required" }, { status: 400 });

    const args = ["--t1", t1];
    if (client) args.push("--client", String(client));
    if (t2) args.push("--t2", String(t2));
    if (limit) args.push("--limit", String(limit));

    const r = await runAgent("benchmark_agent.py", args, 120000);
    if (!r.ok) return NextResponse.json({ error: r.output }, { status: 500 });
    const line = r.output.split("\n").reverse().find((l) => l.trim().startsWith("{"));
    if (!line) return NextResponse.json({ error: "no result", raw: r.output }, { status: 500 });
    return NextResponse.json(JSON.parse(line));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
