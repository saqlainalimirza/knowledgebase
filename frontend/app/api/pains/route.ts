import { NextResponse } from "next/server";
import { q } from "@/lib/db";

// Pain maintenance. Pains are mined into master_sheet_pains with a text `source` = "call <id>"
// (no FK), so deleting a call can leave orphaned pains pointing at a call that no longer exists.
// There was previously no way to remove pains at all; this route provides it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pains?orphans=1  -> report orphaned pains (source call missing)
export async function GET(req: Request) {
  const orphansOnly = new URL(req.url).searchParams.get("orphans");
  if (orphansOnly) {
    const rows = await q<any>(
      `select id, client_slug, kind, item_text, source
       from master_sheet_pains p
       where p.source like 'call %'
         and not exists (select 1 from client_calls cc
                         where cc.source_call_id = regexp_replace(p.source, '^call ', ''))
       order by client_slug, id`,
    );
    return NextResponse.json({ count: rows.length, orphans: rows });
  }
  return NextResponse.json({ error: "pass ?orphans=1 to list orphaned pains" }, { status: 400 });
}

// DELETE /api/pains — body is one of:
//   { "ids": [1,2,3] }        delete these pain ids
//   { "source": "call x" }    delete every pain from this source
//   { "orphans": true }       delete every pain whose source call no longer exists
export async function DELETE(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  try {
    if (Array.isArray(body?.ids) && body.ids.length) {
      const ids = body.ids.filter((n: any) => Number.isInteger(n));
      if (!ids.length) return NextResponse.json({ error: "ids must be integers" }, { status: 400 });
      const rows = await q<any>(
        `delete from master_sheet_pains where id = any($1::bigint[]) returning id`,
        [ids],
      );
      return NextResponse.json({ deleted: rows.length, ids: rows.map((r) => r.id) });
    }

    if (typeof body?.source === "string" && body.source.trim()) {
      const rows = await q<any>(
        `delete from master_sheet_pains where source = $1 returning id`,
        [body.source.trim()],
      );
      return NextResponse.json({ deleted: rows.length, source: body.source.trim() });
    }

    if (body?.orphans === true) {
      const rows = await q<any>(
        `delete from master_sheet_pains p
         where p.source like 'call %'
           and not exists (select 1 from client_calls cc
                           where cc.source_call_id = regexp_replace(p.source, '^call ', ''))
         returning id`,
      );
      return NextResponse.json({ deleted: rows.length, mode: "orphans" });
    }

    return NextResponse.json(
      { error: 'body must be {ids:[...]}, {source:"call x"}, or {orphans:true}' },
      { status: 400 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
