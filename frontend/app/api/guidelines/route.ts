import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { runAgent, writeUpload } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/guidelines?client=kynship  -> that client's guidelines + all globals, newest first.
// No ?client= -> everything (grouped view for the dashboard).
// Optional ?kind=gtm_memory,audit -> only those lanes (copy rules vs GTM memory vs audit log).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const client = url.searchParams.get("client");
  const kinds = (url.searchParams.get("kind") || "")
    .split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  try {
    const where: string[] = ["active"];
    const args: any[] = [];
    if (client) { args.push(client); where.push(`(client_slug=$${args.length} or client_slug is null)`); }
    if (kinds.length) { args.push(kinds); where.push(`lower(kind) = any($${args.length}::text[])`); }
    const rows = await q(
      `select id, client_slug, kind, guideline_text, context, source, created_at
       from guidelines where ${where.join(" and ")}
       order by client_slug nulls last, created_at desc`,
      args
    );
    return NextResponse.json({ count: rows.length, guidelines: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/guidelines — save one guideline or a list.
// Body: {client_slug?, kind?, guideline_text, context?, source?}  or  {items:[...same...]}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : body.items || [body];
    if (!items.length || items.some((i: any) => !i.guideline_text))
      return NextResponse.json({ error: "guideline_text is required on every item" }, { status: 400 });
    const file = await writeUpload("guidelines", JSON.stringify(items));
    const r = await runAgent("guidelines_agent.py", ["--file", file]);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/guidelines — deactivate (soft delete): {id, active:false}
export async function PATCH(req: Request) {
  try {
    const { id, active } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await q(`update guidelines set active=$2 where id=$1`, [id, active !== false ? true : false]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
