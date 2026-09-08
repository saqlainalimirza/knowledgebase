import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";
import { resolveWindow, coverage, WINDOWS } from "@/lib/period";

export const dynamic = "force-dynamic";

// GET /api/clients/{slug}/period?window=this_week&channel=sms
// Sent/PR/power/booked for a named window, with SENT sourced from the ingested daily stats
// (the ops base daily SMS/email feed) instead of campaigns.sent. This is what makes
// "SMS sent this week" and "positive per SMS this week" correct. PRs + power_requests come
// from deals by created date; booked from meeting_booked_at. "redo this week vs last week".
//
// windows: today, yesterday, this_week, last_week, this_month, last_month, last_7d, last_30d,
// all_time. week = Monday..Sunday, anchored to the business tz (America/Los_Angeles).

const pctVal = (n: any, d: any) =>
  Number(d) ? Math.round((Number(n) / Number(d)) * 100000) / 1000 : null; // % to 3dp

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const url = new URL(req.url);
  const window = (url.searchParams.get("window") || "this_week").toLowerCase();
  const channel = (url.searchParams.get("channel") || "").toLowerCase();
  const r = resolveWindow(window);
  if (!r) return NextResponse.json({ error: `unknown window '${window}'. Valid: ${WINDOWS.join(", ")}` }, { status: 400 });
  const chFilter = channel === "sms" || channel === "email" ? channel : null;

  try {
    const cli = await one<any>(`select client from client_roster where slug=$1`, [slug]);
    if (!cli) return NextResponse.json({ error: "client not found" }, { status: 404 });

    const [sends, prs, booked, fresh] = await Promise.all([
      q<any>(
        `select channel, sum(sent)::int sent, sum(coalesce(leads_reached,0))::int leads
         from daily_stats
         where client_slug=$1 and stat_date between $2 and $3 and ($4::text is null or channel=$4)
         group by channel`,
        [slug, r.start, r.end, chFilter]
      ),
      q<any>(
        `select lower(coalesce(channel,'')) channel, count(*)::int prs,
                count(*) filter (where lower(coalesce(positive_reply_category,''))='power request')::int power
         from deals
         where client_slug=$1 and deal_created_at::date between $2 and $3
           and ($4::text is null or lower(coalesce(channel,''))=$4)
         group by 1`,
        [slug, r.start, r.end, chFilter]
      ),
      q<any>(
        `select lower(coalesce(channel,'')) channel, count(*)::int booked
         from deals
         where client_slug=$1 and meeting_booked_at::date between $2 and $3
           and ($4::text is null or lower(coalesce(channel,''))=$4)
         group by 1`,
        [slug, r.start, r.end, chFilter]
      ),
      one<any>(`select max(stat_date) as through from daily_stats where client_slug=$1`, [slug]),
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
      ...(isEmail && c.leads ? { pr_per_lead_pct: pctVal(c.prs, c.leads) } : {}),
    });
    const totSent = acc.sms.sent + acc.email.sent;
    const totPrs = acc.sms.prs + acc.email.prs;

    const through = fresh?.through ? String(fresh.through).slice(0, 10) : null;
    const cov = coverage(r, through);
    return NextResponse.json({
      client: slug,
      client_name: cli.client,
      window,
      range: { start: r.start, end: r.end },
      channel: chFilter || "all",
      ...cov,
      note:
        "sent = messages from the ops daily stat feed (not campaigns.sent). PR per send = per " +
        "message. week = Mon..Sun (business tz)." +
        (cov.no_data_yet
          ? ` WARNING: the daily feed only runs through ${through}, BEFORE this window — numbers are effectively empty, NOT a real read. Report as not available yet.`
          : cov.partial
          ? ` NOTE: feed current through ${through}; ${r.end} (incl. today) not fully counted — treat as partial.`
          : ""),
      sms: chOut(acc.sms, false),
      email: chOut(acc.email, true),
      total: { sent: totSent, prs: totPrs, power_requests: acc.sms.power + acc.email.power, booked: acc.sms.booked + acc.email.booked, pr_per_send_pct: pctVal(totPrs, totSent) },
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
