import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { runAgent } from "@/lib/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Private bug ticketing API. NOT part of the Evergreen data API; not in the skill.
//
// GET /api/tickets?day=2026-07-22            daily board (one day)
// GET /api/tickets?view=all&page=1&pageSize=30&status=&assignee=&qtext=   all-time board
// Always returns counts {unchecked,in_progress,complete}.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "day";
  const day = url.searchParams.get("day");
  const status = url.searchParams.get("status");
  const assignee = url.searchParams.get("assignee");
  const qtext = url.searchParams.get("qtext");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Number(url.searchParams.get("pageSize")) || 30);

  const where: string[] = [];
  const args: any[] = [];
  if (view === "day") {
    args.push(day || new Date().toISOString().slice(0, 10));
    where.push(`day = $${args.length}`);
  }
  if (status) { args.push(status); where.push(`status = $${args.length}`); }
  if (assignee) { args.push(assignee); where.push(`assignee = $${args.length}`); }
  if (qtext) { args.push(`%${qtext}%`); where.push(`text ilike $${args.length}`); }
  const w = where.length ? `where ${where.join(" and ")}` : "";

  try {
    // counts respect the same filter set EXCEPT status (so column totals always show)
    const countWhere: string[] = [];
    const countArgs: any[] = [];
    if (view === "day") { countArgs.push(day || new Date().toISOString().slice(0, 10)); countWhere.push(`day = $${countArgs.length}`); }
    if (assignee) { countArgs.push(assignee); countWhere.push(`assignee = $${countArgs.length}`); }
    if (qtext) { countArgs.push(`%${qtext}%`); countWhere.push(`text ilike $${countArgs.length}`); }
    const cw = countWhere.length ? `where ${countWhere.join(" and ")}` : "";

    // all-time: unresolved first (unchecked, in_progress), then complete; newest first within
    const order =
      view === "all"
        ? `order by (status='complete'), (status='in_progress'),
                    coalesce(resolved_at, updated_at) desc`
        : `order by case status when 'unchecked' then 0 when 'in_progress' then 1 else 2 end,
                    updated_at desc`;

    const offset = (page - 1) * pageSize;
    const [rows, counts, total] = await Promise.all([
      q(`select id, slack_ts, reporter, permalink, text, status, assignee, day,
                created_at, updated_at, resolved_at
         from bug_tickets ${w} ${order}
         limit ${pageSize} offset ${offset}`, args),
      q(`select status, count(*)::int as n from bug_tickets ${cw} group by status`, countArgs),
      q(`select count(*)::int as n from bug_tickets ${w}`, args),
    ]);
    const c: any = { unchecked: 0, in_progress: 0, complete: 0 };
    for (const r of counts as any[]) c[r.status] = r.n;
    return NextResponse.json({
      view, day: day || new Date().toISOString().slice(0, 10),
      counts: c, page, pageSize, total: (total[0] as any)?.n ?? 0, tickets: rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/tickets  {id, status?, assignee?} — update a card
export async function PATCH(req: Request) {
  try {
    const { id, status, assignee } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sets: string[] = ["updated_at = now()"];
    const args: any[] = [];
    if (status) {
      args.push(status); sets.push(`status = $${args.length}`);
      sets.push(status === "complete" ? "resolved_at = now()" : "resolved_at = null");
    }
    if (assignee) { args.push(assignee); sets.push(`assignee = $${args.length}`); }
    args.push(id);
    await q(`update bug_tickets set ${sets.join(", ")} where id = $${args.length}`, args);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/tickets?id=123 — remove a non-bug / noise card
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await q(`delete from bug_tickets where id = $1`, [Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/tickets  {action:"sync"} — "Sync bugs now" button pulls from Slack
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "sync") {
      const r = await runAgent("tickets_sync.py", []);
      return NextResponse.json(r, { status: r.ok ? 200 : 500 });
    }
    // manual ticket creation (optional)
    if (body.text) {
      const day = new Date().toISOString().slice(0, 10);
      const rows = await q(
        `insert into bug_tickets(text, reporter, assignee, day, slack_ts)
         values($1,$2,coalesce($3,'Hilal'),$4,$5) returning id`,
        [body.text, body.reporter || "manual", body.assignee || null, day, `manual-${Date.now()}`]
      );
      return NextResponse.json({ ok: true, id: (rows[0] as any)?.id });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
