import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";

// Human override of a client's niche. Sets niche_id/sub_niche_id + niche_source='human'
// (human wins over the AI) and inherits the niche to the client's pains + case studies.
export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  try {
    const { nicheId, subNicheId } = await req.json();
    if (!nicheId) return NextResponse.json({ error: "nicheId required" }, { status: 400 });

    const niche = await one<any>(`select name from niches where id = $1`, [nicheId]);
    if (!niche) return NextResponse.json({ error: "niche not found" }, { status: 404 });

    await q(
      `update client_roster
         set niche_id = $1, sub_niche_id = $2, niche = $3, niche_source = 'human', updated_at = now()
       where slug = $4`,
      [nicheId, subNicheId || null, niche.name, slug]
    );
    await q(`update master_sheet_pains set niche_id = $1 where client_slug = $2`, [nicheId, slug]);
    await q(`update case_studies set niche_id = $1 where owner_client_slug = $2`, [nicheId, slug]);

    return NextResponse.json({ ok: true, niche: niche.name, source: "human" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
