import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/learnings  { id, status?: 'confirmed', active?: false }
// Confirm a directional ('proposed') learning, or retire one. Human-in-the-loop for the
// hybrid: the agent auto-confirms only significant results; a strategist promotes the rest.
export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sets: string[] = [];
  const args: any[] = [id];
  if (body.status === "confirmed") sets.push("status='confirmed'");
  if (body.active === false) sets.push("active=false");
  if (!sets.length)
    return NextResponse.json({ error: "pass status:'confirmed' or active:false" }, { status: 400 });
  try {
    const rows = await q<any>(
      `update learnings set ${sets.join(", ")}, updated_at=now() where id=$1 returning id, status, active`,
      args,
    );
    if (!rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, learning: rows[0] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
