import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/calls?id=75            -> delete one call (chunks cascade via call_id)
// DELETE /api/calls?source=probe_x   -> delete by source_call_id
// Used to remove test/probe transcripts without hand-editing the DB.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const source = url.searchParams.get("source");
  if (!id && !source)
    return NextResponse.json({ error: "pass ?id= or ?source=" }, { status: 400 });
  try {
    const ids = id
      ? [Number(id)]
      : (await q<{ id: number }>(`select id from client_calls where source_call_id=$1`, [source])).map((r) => r.id);
    if (!ids.length) return NextResponse.json({ deleted_calls: 0, deleted_chunks: 0 });
    const ch = await q(`delete from call_chunks where call_id = any($1) returning id`, [ids]);
    const ca = await q(`delete from client_calls where id = any($1) returning id`, [ids]);
    return NextResponse.json({ deleted_calls: ca.length, deleted_chunks: ch.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
