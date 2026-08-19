import { NextResponse } from "next/server";
import { q, one } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/clients/{slug}/benchmarks
// The client's real send-based rates vs their niche and vs the whole book, so a report
// can say whether a number is good or bad instead of quoting it in a vacuum.
const rates = (r: any) => {
  const sent = Number(r?.sent) || 0;
  const pct = (n: any) => (sent ? Math.round((Number(n) / sent) * 100000) / 1000 : null); // % to 3dp
  return {
    sent,
    positives: Number(r?.pos) || 0, power_requests: Number(r?.pwr) || 0, booked: Number(r?.booked) || 0,
    positive_rate: pct(r?.pos), power_rate: pct(r?.pwr), book_rate: pct(r?.booked),
    clients: r?.clients != null ? Number(r.clients) : undefined,
  };
};
const AGG = `sum(sent) sent, sum(positive_replies) pos, sum(power_requests) pwr, sum(booked) booked`;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  try {
    const cli = await one<any>(`select client, niche from client_roster where slug=$1`, [slug]);
    if (!cli) return NextResponse.json({ error: "client not found" }, { status: 404 });

    const [clientRow, nicheRow, overallRow] = await Promise.all([
      one(`select ${AGG} from campaigns where client_slug=$1 and coalesce(sent,0)>0`, [slug]),
      one(`select ${AGG}, count(distinct c.client_slug) clients
           from campaigns c join client_roster r on r.slug=c.client_slug
           where r.niche=$1 and coalesce(c.sent,0)>0`, [cli.niche]),
      one(`select ${AGG}, count(distinct client_slug) clients from campaigns where coalesce(sent,0)>0`),
    ]);

    const client = rates(clientRow), niche = rates(nicheRow), overall = rates(overallRow);
    const ratio = (a: number | null, b: number | null) =>
      a != null && b ? Math.round((a / b) * 100) / 100 : null; // 1.2 = 20% above benchmark
    return NextResponse.json({
      client: slug, client_name: cli.client, niche: cli.niche,
      metrics: {
        client,
        niche_benchmark: niche,
        overall_benchmark: overall,
      },
      // >1 = beating the benchmark, <1 = below it
      vs_niche: {
        positive_rate: ratio(client.positive_rate, niche.positive_rate),
        power_rate: ratio(client.power_rate, niche.power_rate),
        book_rate: ratio(client.book_rate, niche.book_rate),
      },
      vs_overall: {
        positive_rate: ratio(client.positive_rate, overall.positive_rate),
        power_rate: ratio(client.power_rate, overall.power_rate),
        book_rate: ratio(client.book_rate, overall.book_rate),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
