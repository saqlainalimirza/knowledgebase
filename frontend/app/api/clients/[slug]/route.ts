import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  try {
    const client = await one(
      `select slug, client, niche, sub_niche, offer, airtable_client_id, status
       from client_roster where slug = $1`,
      [slug]
    );
    if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

    const [pains, painKinds, caseStudies, calls, campaigns, niche, guidelines, materials] = await Promise.all([
      q(
        `select id, kind, persona, item_text, confidence, source
         from master_sheet_pains where client_slug=$1
         order by confidence desc, kind limit 500`,
        [slug]
      ),
      q(
        `select kind, count(*)::int as n from master_sheet_pains
         where client_slug=$1 group by kind order by n desc`,
        [slug]
      ),
      q(
        `select id, subject_brand, tier, after_state, unique_mechanism, timeframe, source_ref
         from case_studies where owner_client_slug=$1 order by tier, subject_brand`,
        [slug]
      ),
      q(
        `select c.id, c.title, c.source, c.source_call_id, c.call_date,
                (select count(*) from call_chunks ch where ch.call_id=c.id) as chunks
         from client_calls c where c.client_slug=$1 order by c.id`,
        [slug]
      ),
      q(
        `select id, name, channel, angle, segment, niche, notes,
                sent, positive_replies, power_requests, booked,
                case when coalesce(sent,0) > 0 and power_requests is not null
                     then round(power_requests::numeric / sent, 5) end as power_rate
         from campaigns where client_slug=$1 order by power_requests desc nulls last, name limit 200`,
        [slug]
      ),
      one(
        `select commonalities_summary, top_pains, shared_lingo, dream_outcomes,
                winning_levers, refreshed_at
         from niche_knowledge where niche=$1`,
        [(client as any).niche]
      ),
      q(
        `select id, client_slug, kind, guideline_text, context, source, created_at
         from guidelines where active and (client_slug=$1 or client_slug is null)
         order by client_slug nulls last, created_at desc`,
        [slug]
      ),
      q(
        `select id, title, material_type, context, length(content) as content_chars,
                left(content, 300) as preview
         from materials where client_slug=$1 order by created_at desc`,
        [slug]
      ),
    ]);

    return NextResponse.json({ client, pains, painKinds, caseStudies, calls, campaigns, niche, guidelines, materials });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
