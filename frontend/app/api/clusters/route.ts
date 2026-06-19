import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agents";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { niche, client, threshold } = await req.json();
    if (!niche && !client)
      return NextResponse.json({ error: "niche or client is required" }, { status: 400 });

    const args = ["cluster_pains.py", "--limit", "40"];
    if (niche) args.push("--niche", niche);
    else args.push("--client", client);
    if (threshold) args.push("--threshold", String(threshold));

    const r = await runAgent(args[0], args.slice(1), 120000);
    if (!r.ok) return NextResponse.json({ error: r.output }, { status: 500 });
    const line = r.output.split("\n").reverse().find((l) => l.trim().startsWith("{"));
    if (!line) return NextResponse.json({ error: "no output", raw: r.output }, { status: 500 });
    return NextResponse.json(JSON.parse(line));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
