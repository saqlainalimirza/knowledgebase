import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Which VARIANT / CTA arm inside a campaign performed better — the question the sending
// tool can't answer because it never tagged the variant. variant_detect_agent recovers the
// variant from the message we actually sent (contacts.derived_variant); this groups by it.
//
// GET /api/clients/{slug}/variant-performance?campaign={name}  (or ?campaignId={id})
// "reached" = leads we could attribute to a variant (the fair A/B denominator, not raw sends).
const POSITIVE = ['positive', 'power request', 'meeting booked', 'more info request',
  'email me request', 'maybe', 'referral request'];

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const url = new URL(req.url);
  let campaign = url.searchParams.get("campaign");
  const campaignId = url.searchParams.get("campaignId");
  try {
    if (!campaign && campaignId) {
      const c = await q<any>(`select name from campaigns where id=$1`, [Number(campaignId)]);
      campaign = c[0]?.name || null;
    }
    if (!campaign) return NextResponse.json({ error: "pass ?campaign= (name) or ?campaignId=" }, { status: 400 });

    const rows = await q<any>(
      `select ct.derived_variant as variant,
              count(*)::int as reached,
              count(*) filter (where lower(coalesce(ct.lead_category,'')) = any($3))::int as positives,
              count(*) filter (where lower(coalesce(ct.lead_category,'')) = 'meeting booked')::int as booked,
              (array_agg(left(ct.conversation, 240) order by ct.id))[1] as sample
       from contacts ct join campaigns ca on ca.id = ct.db_campaign_id
       where ct.client_slug = $1 and ca.name = $2 and ct.derived_variant is not null
       group by ct.derived_variant
       order by positives desc`,
      [slug, campaign, POSITIVE]
    );
    const all = rows.map((r) => ({
      variant: r.variant,
      reached: r.reached,
      positives: r.positives,
      booked: r.booked,
      positive_rate_pct: r.reached ? Math.round((r.positives / r.reached) * 1000) / 10 : 0,
      sample_message: r.sample,
    }));
    // Intentional A/B arms are FEW and high-reach; personalization noise is many tiny clusters.
    // Keep only variants with real reach; collapse the rest so the comparison is clean.
    const totalReached = all.reduce((s, v) => s + v.reached, 0);
    const floor = Math.max(20, Math.round(totalReached * 0.08));
    const variants = all.filter((v) => v.reached >= floor).sort((a, b) => b.positive_rate_pct - a.positive_rate_pct);
    const minorCollapsed = all.length - variants.length;

    const verdict = variants.length >= 2
      ? `${variants[0].variant} wins at ${variants[0].positive_rate_pct}% positive (reached ${variants[0].reached}) vs ${variants[variants.length - 1].variant} at ${variants[variants.length - 1].positive_rate_pct}% (reached ${variants[variants.length - 1].reached})`
      : variants.length === 1
      ? "one dominant variant on this campaign (no real A/B split detected — likely one arm or heavy personalization)"
      : "not enough attributed reach to compare";

    return NextResponse.json({
      client: slug, campaign,
      significant_variants: variants.length,
      minor_variants_collapsed: minorCollapsed,
      verdict, variants,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
