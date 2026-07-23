import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/clients/{slug}/status  {status: "active" | "past", churnedAt?}
// Mark a client churned (status:"past") or reactivate (status:"active"). Churned
// clients keep ALL their data (calls, pains, deals, contacts, materials, copies) —
// it stays searchable as reference and is auto-downweighted in copy ranking. The
// daily sync simply stops pulling live data for them (their Airtable is gone).
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  try {
    const { status, churnedAt } = await req.json();
    if (!["active", "past"].includes(status))
      return NextResponse.json({ error: "status must be 'active' or 'past'" }, { status: 400 });

    const churned = status === "past" ? (churnedAt || new Date().toISOString()) : null;
    await q(
      `update client_roster set status=$2, churned_at=$3, updated_at=now() where slug=$1`,
      [params.slug, status, churned]
    );
    const row = await one(
      `select slug, client, status, churned_at from client_roster where slug=$1`, [params.slug]);
    return NextResponse.json({ ok: true, ...row });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
