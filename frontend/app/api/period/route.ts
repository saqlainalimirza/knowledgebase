import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";
import { resolveWindow, coverage, WINDOWS } from "@/lib/period";

export const dynamic = "force-dynamic";

// GET /api/period?window=last_week&channel=sms&by=client
// AGENCY-WIDE totals for a window (all clients), e.g. "how many SMS did WE send last week".
// Sent is summed from the ops daily feed (daily_stats), PRs + power_requests from deals,
// booked from meeting_booked_at. This is the ONE call for agency-wide "how many X did we
// send/get for {window}" — do NOT derive it by subtracting monthly/weekly Airtable rollups
// (that is what produced 728 vs the real 16,404). Add by=client for a per-client breakdown.
//
// windows: today, yesterday, this_week, last_week, this_month, last_month, last_7d, last_30d,
// all_time. week = Monday..Sunday, anchored to the business tz (America/Los_Angeles).

const pctVal = (n: any, d: any) =>
  Number(d) ? Math.round((Number(n) / Number(d)) * 100000) / 1000 : null;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const window = (url.searchParams.get("window") || "last_week").toLowerCase();
  const channel = (url.searchParams.get("channel") || "").toLowerCase();
  const by = (url.searchParams.get("by") || "").toLowerCase();
  const r = resolveWindow(window);
  if (!r) return NextResponse.json({ error: `unknown window '${window}'. Valid: ${WINDOWS.join(", ")}` }, { status: 400 });
  const chFilter = channel === "sms" || channel === "email" ? channel : null;

  try {
    const [sends, prs, booked, fresh, breakdown] = await Promise.all([
      q<any>(
        `select channel, sum(sent)::int sent, sum(coalesce(leads_reached,0))::int leads
         from daily_stats where stat_date between $1 and $2 and ($3::text is null or channel=$3)
         group by channel`,
        [r.start, r.end, chFilter]
      ),
      q<any>(
        `select lower(coalesce(channel,'')) channel, count(*)::int prs,
                count(*) filter (where lower(coalesce(positive_reply_category,''))='power request')::int power
         from deals where deal_created_at::date between $1 and $2
           and ($3::text is null or lower(coalesce(channel,''))=$3) group by 1`,
        [r.start, r.end, chFilter]
      ),
      q<any>(
        `select lower(coalesce(channel,'')) channel, count(*)::int booked
         from deals where meeting_booked_at::date between $1 and $2
           and ($3::text is null or lower(coalesce(channel,''))=$3) group by 1`,
        [r.start, r.end, chFilter]
      ),
      one<any>(`select max(stat_date) as through from daily_stats`),
      by === "client"
        ? q<any>(
            `select ds.client_slug,
                    sum(ds.sent)::int sent,
                    coalesce(dl.prs,0)::int prs
             from daily_stats ds
             left join lateral (
               select count(*) prs from deals d
               where d.client_slug=ds.client_slug and d.deal_created_at::date between $1 and $2
                 and ($3::text is null or lower(coalesce(d.channel,''))=$3)
             ) dl on true
             where ds.stat_date between $1 and $2 and ($3::text is null or ds.channel=$3)
             group by ds.client_slug, dl.prs
             order by sent desc`,
            [r.start, r.end, chFilter]
          )
        : Promise.resolve([]),
    ]);

    type Ch = { sent: number; leads: number; prs: number; power: number; booked: number };
    const blank = (): Ch => ({ sent: 0, leads: 0, prs: 0, power: 0, booked: 0 });
    const acc: Record<string, Ch> = { sms: blank(), email: blank() };
    for (const x of sends) if (acc[x.channel]) { acc[x.channel].sent += x.sent; acc[x.channel].leads += x.leads; }
    for (const x of prs) if (acc[x.channel]) { acc[x.channel].prs += x.prs; acc[x.channel].power += x.power; }
    for (const x of booked) if (acc[x.channel]) acc[x.channel].booked += x.booked;

    const chOut = (c: Ch, isEmail: boolean) => ({
      sent: c.sent,
      ...(isEmail ? { leads_reached: c.leads } : {}),
      prs: c.prs,
      power_requests: c.power,
      booked: c.booked,
      pr_per_send_pct: pctVal(c.prs, c.sent),
    });
    const totSent = acc.sms.sent + acc.email.sent;
    const totPrs = acc.sms.prs + acc.email.prs;
    const through = fresh?.through ? String(fresh.through).slice(0, 10) : null;
    const cov = coverage(r, through);

    return NextResponse.json({
      scope: "agency (all clients)",
      window,
      range: { start: r.start, end: r.end },
      channel: chFilter || "all",
      ...cov, // data_through, covered_through, partial, no_data_yet
      note:
        "Agency-wide totals. sent = messages from the ops daily feed summed across ALL clients. " +
        "PR per send = per message (not per lead). week = Mon..Sun (business tz)." +
        (cov.no_data_yet
          ? ` WARNING: the daily feed only runs through ${through}, which is BEFORE this window (${r.start}..${r.end}) — these numbers are effectively empty, NOT a real read. Report the window as not available yet.`
          : cov.partial
          ? ` NOTE: feed is current through ${through}; ${r.end} (incl. today) is not fully counted — treat as partial.`
          : ""),
      sms: chOut(acc.sms, false),
      email: chOut(acc.email, true),
      total: { sent: totSent, prs: totPrs, power_requests: acc.sms.power + acc.email.power, booked: acc.sms.booked + acc.email.booked, pr_per_send_pct: pctVal(totPrs, totSent) },
      ...(by === "client" ? { by_client: breakdown } : {}),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
