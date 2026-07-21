import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { runAgent, writeUpload } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/materials?client=slug            -> list (metadata + content preview)
// GET /api/materials?client=slug&id=3       -> one material with full content
export async function GET(req: Request) {
  const url = new URL(req.url);
  const client = url.searchParams.get("client");
  const id = url.searchParams.get("id");
  try {
    if (id) {
      const rows = await q(
        `select id, client_slug, title, material_type, context, content, source_ref, created_at
         from materials where id=$1`, [Number(id)]);
      return NextResponse.json(rows[0] || { error: "not found" });
    }
    const rows = client
      ? await q(
          `select m.id, m.client_slug, m.title, m.material_type, m.context, m.source_ref,
                  m.created_at, length(m.content) as content_chars, left(m.content, 400) as preview,
                  (select count(*) from material_chunks c where c.material_id=m.id) as chunks
           from materials m where m.client_slug=$1 order by m.created_at desc`, [client])
      : await q(
          `select m.id, m.client_slug, m.title, m.material_type, m.context, m.created_at,
                  length(m.content) as content_chars
           from materials m order by m.created_at desc`);
    return NextResponse.json({ count: rows.length, materials: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/materials — ingest one material (or {items:[...]}).
// Body: {client_slug, title, material_type?, context?, content, source_ref?}
// Same title for the same client replaces the previous version.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : body.items || [body];
    for (const i of items)
      if (!i.client_slug || !i.title || !i.content)
        return NextResponse.json({ error: "client_slug, title and content are required" }, { status: 400 });
    const file = await writeUpload("materials", JSON.stringify(items));
    const r = await runAgent("materials_agent.py", ["--file", file]);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/materials?id=3 — remove a material (chunks cascade)
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await q(`delete from materials where id=$1`, [Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
