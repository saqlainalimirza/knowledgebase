import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// The reply-intelligence layer: every categorized reply for a client, from the
// Contacts (Synced From CRM) table mirrored into Evergreen. Use THIS for reply
// categories / negative replies / "why aren't people responding" — not GHL MCP.
//
// GET /api/clients/{slug}/contacts
//   ?category=Objection%20Handling   filter to one reply category
//   ?channel=sms|email               filter by channel
//   ?campaignId=123                  filter to a DB campaign
//   ?weeks=8                         only replies in the last N weeks (default: all)
//   ?limit=200                       cap threads returned (default 200)
// Always returns aggregates (by_category, by_channel, weekly_trend) computed over the
// filtered set, plus the individual threads.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const channel = url.searchParams.get("channel");
  const campaignId = url.searchParams.get("campaignId");
  const weeks = Number(url.searchParams.get("weeks")) || 0;
  const limit = Number(url.searchParams.get("limit")) || 200;

  const where = ["client_slug = $1"];
  const args: any[] = [slug];
  if (category) { args.push(category); where.push(`lead_category = $${args.length}`); }
  if (channel) { args.push(channel); where.push(`channel = $${args.length}`); }
  if (campaignId) { args.push(Number(campaignId)); where.push(`db_campaign_id = $${args.length}`); }
  if (weeks) where.push(`created_at >= now() - interval '${weeks} weeks'`);
  const w = where.join(" and ");

  try {
    const [total, byCategory, byChannel, weekly, threads] = await Promise.all([
      q(`select count(*)::int as n from contacts where ${w}`, args),
      q(`select coalesce(lead_category,'(uncategorized)') as category, count(*)::int as n
          from contacts where ${w} group by 1 order by 2 desc`, args),
      q(`select coalesce(channel,'(unknown)') as channel, count(*)::int as n
          from contacts where ${w} group by 1 order by 2 desc`, args),
      q(`select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as n
          from contacts where ${w} and created_at is not null
          group by 1 order by 1 desc limit 12`, args),
      q(`select id, name, title, job_function, company, lead_category, channel,
                campaign_name, copy_variant, created_at,
                left(conversation, 1200) as conversation_snippet
          from contacts where ${w}
          order by created_at desc nulls last limit ${limit}`, args),
    ]);
    return NextResponse.json({
      client: slug,
      total: (total[0] as any)?.n ?? 0,
      by_category: byCategory,
      by_channel: byChannel,
      weekly_trend: weekly,
      threads,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
