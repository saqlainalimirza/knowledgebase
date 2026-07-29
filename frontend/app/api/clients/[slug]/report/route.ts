import { NextResponse } from "next/server";
import { one, q } from "@/lib/db";
import { getRecord } from "@/lib/airtable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Client report: the thing Aaman couldn't get before — per campaign, the ACTUAL copy that's
// live plus its real performance, and the client's KPIs vs their own targets + trend.
//
// The live copy is never stored in Airtable (it lives in the sending tools, GHL/Smartlead),
// so we RECONSTRUCT it from the outbound messages inside each reply thread (copy_mine_agent)
// and link it to the campaign — which is why the campaign's stats ARE the copy's performance.
// Benchmark = the client's OWN targets + trend (no invented external numbers).
//
// GET /api/clients/{slug}/report

const num = (v: any) => (typeof v === "number" ? v : Number(v) || 0);

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  try {
    const client = await one<any>(
      `select slug, client, niche, status, airtable_client_id from client_roster where slug=$1`,
      [slug]
    );
    if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

    // campaigns + their reconstructed live copy (prefer deal-mined, else contact-mined, newest)
    const campaigns = await q<any>(
      `select c.id, c.name, c.channel, c.sent, c.replies, c.positive_replies,
              c.power_requests, c.booked,
              cp.t1, cp.t2, cp.variant, cp.char_t1, cp.char_t2,
              cp.origin as copy_origin, cp.updated_at as copy_updated_at
       from campaigns c
       left join lateral (
         select t1, t2, variant, char_t1, char_t2, origin, updated_at
         from copies
         where campaign_id = c.id and origin in ('mined_from_deal','mined_from_contact')
         order by (origin = 'mined_from_deal') desc, updated_at desc
         limit 1
       ) cp on true
       where c.client_slug = $1
       order by c.power_requests desc nulls last, c.sent desc nulls last
       limit 300`,
      [slug]
    );

    // keep campaigns that actually ran or have a reconstructed copy (drop dead shells)
    const active = campaigns.filter((c) => num(c.sent) > 0 || c.t1);

    // the client's OWN average power_rate — an internal reference, not an external benchmark
    const rated = active.filter((c) => num(c.sent) > 0);
    const avgPower = rated.length
      ? rated.reduce((s, c) => s + num(c.power_requests) / num(c.sent), 0) / rated.length
      : 0;

    const rows = active.map((c) => {
      const sent = num(c.sent);
      const powerRate = sent ? num(c.power_requests) / sent : 0;
      const hasCopy = !!c.t1;
      return {
        id: c.id,
        name: c.name,
        channel: c.channel,
        sent,
        replies: num(c.replies),
        positives: num(c.positive_replies),
        power_requests: num(c.power_requests),
        booked: num(c.booked),
        power_rate_pct: Math.round(powerRate * 1000) / 10,
        live_copy: hasCopy
          ? {
              t1: c.t1,
              t2: c.t2,
              variant: c.variant,
              char_t1: c.char_t1,
              char_t2: c.char_t2,
              source:
                c.copy_origin === "mined_from_deal"
                  ? "reconstructed from won/positive reply threads"
                  : "reconstructed from reply threads",
              reconstructed_at: c.copy_updated_at,
            }
          : null,
        copy_status: hasCopy ? "reconstructed" : "no_reply_captured",
        vs_client_avg: !sent
          ? "n/a"
          : powerRate > avgPower * 1.1
          ? "above"
          : powerRate < avgPower * 0.9
          ? "below"
          : "at",
      };
    });

    // client KPI targets + this-week / this-month actuals, straight from the Airtable client record
    let kpi: any = null;
    if (client.airtable_client_id) {
      try {
        const f: any = await getRecord("📂 Clients", client.airtable_client_id);
        const period = (suf: string) => ({
          sent: num(f[`SMS Sent ${suf}`]) + num(f[`Emails Sent ${suf}`]),
          positives: num(f[`Total Positive Replies ${suf}`]),
          booked: num(f[`Total Meetings Booked ${suf}`]),
          conversion: f[`Total Conversion Rate ${suf}`] || "—",
        });
        const targets = {
          weeklyBooked: num(f["KPI - Weekly Meetings Booked"]),
          monthlyBooked: num(f["KPI - Monthly Meetings Booked"]),
          weeklyPositives: num(
            f["KPI - Weekly Positive Replies"] ?? f["KPI - Total Weekly Positive Replies"]
          ),
        };
        const week = period("This Week");
        const month = period("This Calendar Month");
        kpi = {
          targets,
          this_week: week,
          this_month: month,
          on_track: {
            weeklyBooked: targets.weeklyBooked ? week.booked >= targets.weeklyBooked : null,
            weeklyPositives: targets.weeklyPositives ? week.positives >= targets.weeklyPositives : null,
            monthlyBooked: targets.monthlyBooked ? month.booked >= targets.monthlyBooked : null,
          },
        };
      } catch {
        // leave kpi null if the Airtable lookup fails — the campaign/copy report still returns
      }
    }

    // weekly trend from real deal data (last 8 weeks): positives + booked per week
    const weekly = await q<any>(
      `select to_char(date_trunc('week', deal_created_at), 'YYYY-MM-DD') as week,
              count(*) filter (where positive_reply_category is not null)::int as positives,
              count(*) filter (where meeting_booked_at is not null)::int as booked
       from deals
       where client_slug = $1 and deal_created_at is not null
       group by 1 order by 1 desc limit 8`,
      [slug]
    );

    return NextResponse.json({
      client: { slug: client.slug, name: client.client, niche: client.niche, status: client.status },
      kpi,
      weekly_trend: weekly,
      summary: {
        campaigns: rows.length,
        with_live_copy: rows.filter((r) => r.copy_status === "reconstructed").length,
        avg_power_rate_pct: Math.round(avgPower * 1000) / 10,
      },
      campaigns: rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
