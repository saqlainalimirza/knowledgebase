import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/churn  -> the churned/paused cohort with the pre-churn performance you need
// to analyse WHY they left. Sourced from client_roster (churn facts mirrored from the
// Airtable CRM) + their backfilled campaigns/deals history.
//
// Per client: tenure, lifetime sent / PR / booked, PR rate, and a deal-volume trend
// (PRs in the final 60 days before churn vs the 60 days before that) so a dying account
// is visible. Airtable stores no free-text reason; churn_reason seeds from the CRM
// status (Churned / Paused) and is editable in the roster for real reasons later.
//
// Query: ?status=churned|paused (default: both) &niche=<niche>
const pct = (n: any, d: any) =>
  Number(d) ? Math.round((Number(n) / Number(d)) * 100000) / 1000 : null; // % to 3dp

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "").toLowerCase(); // churned|paused|''
  const niche = url.searchParams.get("niche");
  try {
    const rows = await q<any>(
      `select r.slug, r.client, r.niche, r.churn_status, r.churn_reason,
              r.churned_at, r.onboarded_at,
              c.sent,
              d.total_deals, d.power, d.booked, d.last_deal_at, d.deals_final60, d.deals_prev60
       from client_roster r
       left join lateral (
         select coalesce(sum(sent),0) sent from campaigns where client_slug = r.slug
       ) c on true
       left join lateral (
         -- PR = count of ALL deals for the client (a deal IS a positive reply); sourced
         -- straight from deals, not campaign roll-up, so deals that never matched a
         -- campaign name (e.g. dma) still count.
         select count(*) total_deals,
           count(*) filter (where lower(coalesce(positive_reply_category,'')) = 'power request') power,
           count(*) filter (where lower(coalesce(stage,'')) in ('meeting booked','show','won')
             or lower(coalesce(positive_reply_category,'')) = 'meeting booked') booked,
           max(deal_created_at) last_deal_at,
           count(*) filter (where r.churned_at is not null
             and deal_created_at >= r.churned_at - interval '60 days') deals_final60,
           count(*) filter (where r.churned_at is not null
             and deal_created_at >= r.churned_at - interval '120 days'
             and deal_created_at <  r.churned_at - interval '60 days') deals_prev60
         from deals where client_slug = r.slug
       ) d on true
       where r.status = 'past'
         and ($1 = '' or lower(r.churn_status) = $1)
         and ($2::text is null or r.niche = $2)
       order by r.churned_at desc nulls last`,
      [status, niche]
    );

    const clients = rows.map((r) => {
      const tenureDays =
        r.churned_at && r.onboarded_at
          ? Math.round(
              (new Date(r.churned_at).getTime() - new Date(r.onboarded_at).getTime()) / 86400000
            )
          : null;
      const f60 = Number(r.deals_final60) || 0;
      const p60 = Number(r.deals_prev60) || 0;
      // PR-volume trend heading INTO churn, from the two 60-day windows before churn_at.
      let trend: string | null = null;
      if (r.churned_at) {
        if (f60 === 0 && p60 === 0) trend = "quiet_before_churn"; // no PRs in the last 120d
        else if (p60 === 0) trend = "recent_only"; // activity only in the final 60d
        else if (f60 <= p60 * 0.5) trend = "drying_up"; // volume more than halved into churn
        else if (f60 >= p60 * 1.25) trend = "still_active"; // left despite rising volume
        else trend = "steady";
      }
      return {
        slug: r.slug,
        client: r.client,
        niche: r.niche,
        churn_status: r.churn_status, // Churned | Paused
        churn_reason: r.churn_reason, // seeded from status; editable for a real reason
        churned_at: r.churned_at,
        onboarded_at: r.onboarded_at,
        tenure_days: tenureDays,
        tenure_months: tenureDays != null ? Math.round((tenureDays / 30.44) * 10) / 10 : null,
        lifetime: {
          sent: Number(r.sent) || 0,
          positive_replies: Number(r.total_deals) || 0, // PR = deal count
          power_requests: Number(r.power) || 0,
          booked: Number(r.booked) || 0,
          positive_rate_pct: pct(r.total_deals, r.sent),
          book_rate_pct: pct(r.booked, r.sent),
        },
        deals: {
          total: Number(r.total_deals) || 0,
          last_deal_at: r.last_deal_at,
          final_60d: f60, // PRs in the 60d before churn
          prev_60d: p60, // PRs in the 60d before that
          trend, // drying_up | steady | still_growing | new
        },
      };
    });

    const churned = clients.filter((c) => (c.churn_status || "").toLowerCase() === "churned");
    const paused = clients.filter((c) => (c.churn_status || "").toLowerCase() === "paused");
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };

    return NextResponse.json({
      as_of: new Date().toISOString(),
      note:
        "Cohort = clients marked Churned/Paused in the Airtable CRM that Evergreen has " +
        "onboarded. Churn date + status mirror the CRM; performance is the backfilled " +
        "outbound history. 'drying_up' = PR volume in the last 60d before churn fell to " +
        "<=half the prior 60d. Airtable has no free-text reason field; add real reasons to " +
        "client_roster.churn_reason to see them here.",
      summary: {
        total: clients.length,
        churned: churned.length,
        paused: paused.length,
        avg_tenure_months: avg(clients.map((c) => c.tenure_months)),
        avg_positive_rate_pct: avg(clients.map((c) => c.lifetime.positive_rate_pct)),
        drying_up_at_churn: clients.filter((c) => c.deals.trend === "drying_up").length,
      },
      clients,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
