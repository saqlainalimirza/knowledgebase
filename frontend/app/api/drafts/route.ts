import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { runAgent, writeUpload } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Client research/draft scratchpad — works for clients NOT yet onboarded (empty clients).
// Your working intelligence about a client (research, ICP, angles, draft copy, notes),
// distinct from guidelines (copy rules) and materials (the client's own docs).
//
// GET  /api/drafts?client=slug[&kind=research]   -> list
// POST /api/drafts  {client_slug, kind?, title?, content}  (or {items:[...]})
// DELETE /api/drafts?id=123
export async function GET(req: Request) {
  const url = new URL(req.url);
  const client = url.searchParams.get("client");
  const kind = url.searchParams.get("kind");
  try {
    const where: string[] = [];
    const args: any[] = [];
    if (client) { args.push(client); where.push(`client_slug=$${args.length}`); }
    if (kind) { args.push(kind); where.push(`kind=$${args.length}`); }
    const w = where.length ? `where ${where.join(" and ")}` : "";
    const rows = await q(
      `select id, client_slug, kind, title, content, source, created_at
       from client_drafts ${w} order by created_at desc`, args);
    return NextResponse.json({ count: rows.length, drafts: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : body.items || [body];
    if (items.some((i: any) => !i.client_slug || !i.content))
      return NextResponse.json({ error: "client_slug and content required on every item" }, { status: 400 });
    const file = await writeUpload("drafts", JSON.stringify(items));
    const r = await runAgent("drafts_agent.py", ["--file", file]);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await q(`delete from client_drafts where id=$1`, [Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
