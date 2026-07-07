import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Canonical niche tree for the override dropdowns.
export async function GET() {
  try {
    const rows = await q<any>(`
      select p.id as niche_id, p.name as niche, c.id as sub_id, c.name as sub_niche
      from niches p
      left join niches c on c.parent_id = p.id
      where p.parent_id is null
      order by p.name, c.name`);
    // group into { niche_id, niche, subs:[{id,name}] }
    const map = new Map<number, any>();
    for (const r of rows) {
      if (!map.has(r.niche_id)) map.set(r.niche_id, { id: r.niche_id, name: r.niche, subs: [] });
      if (r.sub_id) map.get(r.niche_id).subs.push({ id: r.sub_id, name: r.sub_niche });
    }
    return NextResponse.json(Array.from(map.values()));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
