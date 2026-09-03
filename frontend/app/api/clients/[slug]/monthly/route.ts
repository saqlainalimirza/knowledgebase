import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clients/{slug}/monthly?months=12&channel=sms|email
// The month-by-month trend Aaman wanted in ONE fast call: per month, send volume
// (from the ingested daily stats), PRs (deals by created date), meetings booked
// (meeting_booked_at, the persistent event), and PR-per-send rates, split by channel.
// Answers "which months peaked / was summer slow / PR per SMS by month" directly.
const pctVal = (n: any, d: any) =>
  Number(d) ? Math.round((Number(n) / Number(d)) * 100000) / 1000 : null; // % to 3dp

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const url = new URL(req.url);
  const months = Math.min(Math.max(Number(url.searchParams.get("months")) || 12, 1), 36);
  const channel = (url.searchParams.get("channel") || "").toLowerCase(); // sms|email|''
  try {
    const cli = await one<any>(`select client, niche from client_roster where slug=$1`, [slug]);
    if (!cli) return NextResponse.json({ error: "client not found" }, { status: 404 });

    const chFilter = channel === "sms" || channel === "email" ? channel : null;
    const since = `to_char((now() - ($2 || ' months')::interval), 'YYYY-MM')`;

    const [sends, prs, booked] = await Promise.all([
      // send volume from the ingested daily stats (sent = messages; leads for email)
      q<any>(
        `select to_char(stat_date,'YYYY-MM') ym, channel,
                sum(sent)::int sent, sum(coalesce(leads_reached,0))::int leads
         from daily_stats
         where client_slug=$1 and stat_date is not null
           and to_char(stat_date,'YYYY-MM') >= ${since}
           and ($3::text is null or channel=$3)
         group by 1,2`,
        [slug, months, chFilter]
      ),
      // PRs: a deal IS a positive reply, bucket by the month it was created
      q<any>(
        `select to_char(deal_created_at,'YYYY-MM') ym, lower(coalesce(channel,'')) channel, count(*)::int prs
         from deals
         where client_slug=$1 and deal_created_at is not null
           and to_char(deal_created_at,'YYYY-MM') >= ${since}
           and ($3::text is null or lower(coalesce(channel,''))=$3)
         group by 1,2`,
        [slug, months, chFilter]
      ),
      // meetings booked: the persistent event, not the transient current stage
      q<any>(
        `select to_char(meeting_booked_at,'YYYY-MM') ym, lower(coalesce(channel,'')) channel, count(*)::int booked
         from deals
         where client_slug=$1 and meeting_booked_at is not null
           and to_char(meeting_booked_at,'YYYY-MM') >= ${since}
           and ($3::text is null or lower(coalesce(channel,''))=$3)
         group by 1,2`,
        [slug, months, chFilter]
      ),
    ]);

    // merge the three grouped sets into one row per month
    type Ch = { sent: number; leads: number; prs: number; booked: number };
    const blank = (): Ch => ({ sent: 0, leads: 0, prs: 0, booked: 0 });
    const byMonth: Record<string, { sms: Ch; email: Ch }> = {};
    const row = (ym: string) => (byMonth[ym] ||= { sms: blank(), email: blank() });
    const bucket = (m: any, ch: string): Ch | null =>
      ch === "sms" ? m.sms : ch === "email" ? m.email : null;

    for (const r of sends) { const b = bucket(row(r.ym), r.channel); if (b) { b.sent += r.sent; b.leads += r.leads; } }
    for (const r of prs) { const b = bucket(row(r.ym), r.channel); if (b) b.prs += r.prs; }
    for (const r of booked) { const b = bucket(row(r.ym), r.channel); if (b) b.booked += r.booked; }

    const chOut = (c: Ch, isEmail: boolean) => ({
      sent: c.sent,
      ...(isEmail ? { leads_reached: c.leads } : {}),
      prs: c.prs,
      booked: c.booked,
      pr_per_send_pct: pctVal(c.prs, c.sent), // PR per message sent (what Aaman asked)
      ...(isEmail && c.leads ? { pr_per_lead_pct: pctVal(c.prs, c.leads) } : {}),
    });

    const monthsOut = Object.keys(byMonth)
      .sort()
      .reverse()
      .map((ym) => {
        const m = byMonth[ym];
        const totSent = m.sms.sent + m.email.sent;
        const totPrs = m.sms.prs + m.email.prs;
        return {
          month: ym,
          sms: chOut(m.sms, false),
          email: chOut(m.email, true),
          total: { sent: totSent, prs: totPrs, booked: m.sms.booked + m.email.booked, pr_per_send_pct: pctVal(totPrs, totSent) },
        };
      });

    // peaks, so the answer can say which months were best without eyeballing
    const withVol = monthsOut.filter((m) => m.total.sent > 0);
    const peakVolume = withVol.slice().sort((a, b) => b.total.sent - a.total.sent)[0]?.month || null;
    const peakPrs = monthsOut.slice().sort((a, b) => b.total.prs - a.total.prs)[0]?.month || null;
    const bestRate = withVol
      .filter((m) => m.total.pr_per_send_pct != null)
      .sort((a, b) => (b.total.pr_per_send_pct as number) - (a.total.pr_per_send_pct as number))[0]?.month || null;

    return NextResponse.json({
      client: slug,
      client_name: cli.client,
      window_months: months,
      channel: chFilter || "all",
      note:
        "sent = messages sent that month (SMS texts / emails), from the daily stat feed. " +
        "PR per send = PRs / messages (what 'PR per SMS' means). For email, pr_per_lead_pct " +
        "uses New Leads Reached instead. booked = meeting_booked_at (the event, so it counts " +
        "meetings that later moved to show/won/etc, unlike a current-stage count).",
      peaks: { by_send_volume: peakVolume, by_prs: peakPrs, by_pr_rate: bestRate },
      months: monthsOut,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
