import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clients/{slug}/period?window=this_week&channel=sms
// Sent/PR/booked for a named window, with SENT sourced from the ingested daily stats
// (the ops base daily SMS/email feed) instead of campaigns.sent. This is what makes
// "SMS sent this week" and "positive per SMS this week" correct. PRs come from deals by
// created date; booked from meeting_booked_at. Answers "redo this week vs last week" etc.
//
// windows: today, yesterday, this_week, last_week, this_month, last_month, last_7d, last_30d
// week = Monday..Sunday (Postgres date_trunc('week')).

const pctVal = (n: any, d: any) =>
  Number(d) ? Math.round((Number(n) / Number(d)) * 100000) / 1000 : null; // % to 3dp

// resolve a window name to [start, end] inclusive dates (server "today")
function range(window: string): { start: string; end: string } | null {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const d = (base: Date, days: number) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + days); return x; };
  const monday = (base: Date) => { const x = new Date(base); const wd = (x.getUTCDay() + 6) % 7; return d(x, -wd); }; // Mon=0
  const firstOfMonth = (base: Date) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  switch (window) {
    case "today": return { start: iso(today), end: iso(today) };
    case "yesterday": return { start: iso(d(today, -1)), end: iso(d(today, -1)) };
    case "this_week": return { start: iso(monday(today)), end: iso(today) };
    case "last_week": return { start: iso(d(monday(today), -7)), end: iso(d(monday(today), -1)) };
    case "this_month": return { start: iso(firstOfMonth(today)), end: iso(today) };
    case "last_month": {
      const lm = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { start: iso(lm), end: iso(d(firstOfMonth(today), -1)) };
    }
    case "last_7d": return { start: iso(d(today, -6)), end: iso(today) };
    case "last_30d": return { start: iso(d(today, -29)), end: iso(today) };
    default: return null;
  }
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const url = new URL(req.url);
  const window = (url.searchParams.get("window") || "this_week").toLowerCase();
  const channel = (url.searchParams.get("channel") || "").toLowerCase();
  const r = range(window);
  if (!r) return NextResponse.json({ error: `unknown window '${window}'` }, { status: 400 });
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
        `select lower(coalesce(channel,'')) channel, count(*)::int prs
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

    type Ch = { sent: number; leads: number; prs: number; booked: number };
    const blank = (): Ch => ({ sent: 0, leads: 0, prs: 0, booked: 0 });
    const acc: Record<string, Ch> = { sms: blank(), email: blank() };
    for (const x of sends) if (acc[x.channel]) { acc[x.channel].sent += x.sent; acc[x.channel].leads += x.leads; }
    for (const x of prs) if (acc[x.channel]) acc[x.channel].prs += x.prs;
    for (const x of booked) if (acc[x.channel]) acc[x.channel].booked += x.booked;

    const chOut = (c: Ch, isEmail: boolean) => ({
      sent: c.sent,
      ...(isEmail ? { leads_reached: c.leads } : {}),
      prs: c.prs,
      booked: c.booked,
      pr_per_send_pct: pctVal(c.prs, c.sent),
      ...(isEmail && c.leads ? { pr_per_lead_pct: pctVal(c.prs, c.leads) } : {}),
    });
    const totSent = acc.sms.sent + acc.email.sent;
    const totPrs = acc.sms.prs + acc.email.prs;

    const through = fresh?.through ? String(fresh.through).slice(0, 10) : null;
    const stale = through && through < r.end;
    return NextResponse.json({
      client: slug,
      client_name: cli.client,
      window,
      range: { start: r.start, end: r.end },
      channel: chFilter || "all",
      data_through: through,
      note:
        "sent = messages from the ops daily stat feed (the accurate source, not campaigns.sent). " +
        "PR per send = PRs / messages. week = Mon..Sun." +
        (stale ? ` NOTE: the daily feed is only current through ${through}, so ${r.end} (incl. today) is not fully counted yet.` : ""),
      sms: chOut(acc.sms, false),
      email: chOut(acc.email, true),
      total: { sent: totSent, prs: totPrs, booked: acc.sms.booked + acc.email.booked, pr_per_send_pct: pctVal(totPrs, totSent) },
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
