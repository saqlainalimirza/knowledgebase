import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "PRs per copy" — the reliable answer. Each campaign runs one or more variants (A/B/C),
// and every reply carries its variant (contacts.copy_variant) + its reply category. So we
// group by (campaign, variant) and count positives: that IS the per-copy performance, no
// copy-table dependency and no clustering. The reconstructed copy text is attached per
// variant as a label. "reached" = categorized contacts on that variant (the comparable
// denominator); it is not raw sends, so treat the % as a fair A-vs-B comparison.
//
// GET /api/clients/{slug}/copy-performance?weeks=0   (weeks>0 = only replies in the last N weeks)

const POS = /positive|meeting|power|maybe/i;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const weeks = Number(new URL(req.url).searchParams.get("weeks")) || 0;
  try {
    const where = ["client_slug = $1", "campaign_name is not null"];
    const args: any[] = [slug];
    if (weeks) where.push(`created_at >= now() - interval '${weeks} weeks'`);

    // per (campaign, variant) reach + positives, straight from the reply layer
    const rows = await q<any>(
      `select campaign_name,
              max(db_campaign_id) as db_campaign_id,
              coalesce(nullif(trim(copy_variant), ''), '?') as variant,
              max(channel) as channel,
              count(*)::int as reached,
              count(*) filter (where lead_category ~* 'positive|meeting|power|maybe')::int as positive,
              max(created_at) as last_reply
       from contacts
       where ${where.join(" and ")}
       group by campaign_name, variant`,
      args
    );

    // reconstructed copy text per (campaign_id, variant) to attach as the variant's label
    const copies = await q<any>(
      `select campaign_id, coalesce(variant,'A') as variant, t1, t2
       from copies
       where client_slug = $1 and origin in ('mined_from_deal','mined_from_contact')`,
      [slug]
    );
    const copyByCampVar = new Map<string, any>();
    const copyByCamp = new Map<number, any>();
    for (const c of copies) {
      copyByCampVar.set(`${c.campaign_id}|${String(c.variant).toUpperCase()}`, c);
      if (!copyByCamp.has(c.campaign_id)) copyByCamp.set(c.campaign_id, c);
    }

    // assemble per campaign
    const camps = new Map<string, any>();
    for (const r of rows) {
      const key = r.campaign_name;
      let camp = camps.get(key);
      if (!camp) {
        camp = {
          campaign: r.campaign_name,
          db_campaign_id: r.db_campaign_id,
          channel: r.channel || null,
          last_reply: r.last_reply,
          variants: [] as any[],
          total_reached: 0,
          total_positive: 0,
        };
        camps.set(key, camp);
      }
      if (r.db_campaign_id && !camp.db_campaign_id) camp.db_campaign_id = r.db_campaign_id;
      if (r.last_reply && (!camp.last_reply || r.last_reply > camp.last_reply)) camp.last_reply = r.last_reply;
      const copy =
        copyByCampVar.get(`${r.db_campaign_id}|${String(r.variant).toUpperCase()}`) ||
        copyByCamp.get(r.db_campaign_id) ||
        null;
      camp.variants.push({
        variant: r.variant,
        reached: r.reached,
        positive: r.positive,
        pr_pct: r.reached ? Math.round((r.positive / r.reached) * 1000) / 10 : 0,
        copy: copy ? { t1: copy.t1, t2: copy.t2 } : null,
      });
      camp.total_reached += r.reached;
      camp.total_positive += r.positive;
    }

    const campaigns = Array.from(camps.values())
      .map((c) => {
        c.variants.sort((a: any, b: any) => (a.variant > b.variant ? 1 : -1));
        // flag the winning variant when there's a real comparison
        const comparable = c.variants.filter((v: any) => v.variant !== "?" && v.reached >= 5);
        if (comparable.length >= 2) {
          const best = comparable.slice().sort((a: any, b: any) => b.pr_pct - a.pr_pct)[0];
          c.winner = best.variant;
        }
        c.ab = c.variants.filter((v: any) => v.variant !== "?").length >= 2;
        return c;
      })
      .sort((a, b) => (b.last_reply > a.last_reply ? 1 : -1));

    return NextResponse.json({
      client: slug,
      weeks: weeks || "all-time",
      note: "'reached' = categorized replies on that variant, a fair A-vs-B denominator, not raw sends.",
      ab_campaigns: campaigns.filter((c) => c.ab).length,
      campaigns,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
