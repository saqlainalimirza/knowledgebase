import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET  /api/tickets/assignees        -> ["Hilal","Saqlain",...]
// POST /api/tickets/assignees {name} -> add a new assignee name
export async function GET() {
  try {
    const rows = await q<{ name: string }>(`select name from bug_ticket_assignees order by name`);
    return NextResponse.json({ assignees: rows.map((r) => r.name) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    const n = String(name || "").trim();
    if (!n) return NextResponse.json({ error: "name required" }, { status: 400 });
    await q(`insert into bug_ticket_assignees(name) values($1) on conflict do nothing`, [n]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
