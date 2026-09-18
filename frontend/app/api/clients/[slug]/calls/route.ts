import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { runAgent } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/clients/{slug}/calls            -> list this client's sales calls (metadata)
// GET /api/clients/{slug}/calls?q=...       -> semantic search WITHIN this client's calls only
//     &limit=8
//
// This is the clean entry point for "what did {client}'s sales calls say about X" — it scopes
// the call-chunk search to one client (the global /api/search type:calls mixes every client),
// and every hit carries which recording it came from (title/date/source_call_id).
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const url = new URL(req.url);
  const query = url.searchParams.get("q");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 8, 50);

  try {
    // no query -> list the client's calls with chunk counts
    if (!query?.trim()) {
      const calls = await q<any>(
        `select c.id, c.title, c.source, c.source_call_id, c.call_date,
                (select count(*) from call_chunks ch where ch.call_id = c.id)::int as chunks
         from client_calls c
         where c.client_slug = $1
         order by c.call_date desc nulls last, c.id desc`,
        [slug],
      );
      return NextResponse.json({
        client: slug,
        count: calls.length,
        note: "Add ?q=... to semantic-search within these calls.",
        calls,
      });
    }

    // query -> scoped semantic search over this client's call chunks (reuses search_agent)
    const r = await runAgent(
      "search_agent.py",
      ["--type", "calls", "--client", slug, "--query", query, "--limit", String(limit)],
      120000,
    );
    if (!r.ok) return NextResponse.json({ error: r.output }, { status: 500 });
    const line = r.output.split("\n").reverse().find((l) => l.trim().startsWith("{"));
    if (!line) return NextResponse.json({ client: slug, query, results: [] });
    const parsed = JSON.parse(line);
    return NextResponse.json({ client: slug, query, results: parsed.results ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
