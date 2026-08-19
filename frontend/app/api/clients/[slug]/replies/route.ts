import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Reply-reason analytics ("why are people replying / saying no").
// Sourced from CONTACTS (every categorized reply, incl. negatives and opt-outs) — deals
// only holds the positive/pipeline side, which undercounts replies massively. lost_reason
// still comes from deals (contacts has no such field). ?weeks=4 windows recent activity.
const POSITIVE = ['positive', 'power request', 'meeting booked', 'more info request',
  'email me request', 'maybe', 'referral request', 'future request', 'objection handling'];
const NEGATIVE = ['not interested', 'wrong number', 'retired', 'threat', 'disqualified'];

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const weeks = Math.min(52, Number(new URL(req.url).searchParams.get("weeks")) || 4);
  try {
    const [byCategory, recentByCategory, totals, byLostReason, weekly, noExamples] = await Promise.all([
      q(`select coalesce(lead_category,'(uncategorized)') as category, count(*)::int as n
         from contacts where client_slug=$1 group by 1 order by n desc`, [slug]),
      q(`select coalesce(lead_category,'(uncategorized)') as category, count(*)::int as n
         from contacts where client_slug=$1 and created_at > now() - ($2 || ' weeks')::interval
         group by 1 order by n desc`, [slug, String(weeks)]),
      q(`select count(*)::int as total_replies,
                count(*) filter (where lower(coalesce(lead_category,'')) = any($2))::int as positive,
                count(*) filter (where lower(coalesce(lead_category,'')) = any($3))::int as negative,
                count(*) filter (where lower(coalesce(lead_category,'')) in ('neutral','ai error','out of office'))::int as neutral
         from contacts where client_slug=$1`, [slug, POSITIVE, NEGATIVE]),
      // lost_reason only exists on deals
      q(`select lost_reason, count(*)::int as n from deals
         where client_slug=$1 and lost_reason is not null group by 1 order by n desc`, [slug]),
      q(`select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week_start,
                count(*)::int as replies,
                count(*) filter (where lower(coalesce(lead_category,'')) = any($3))::int as positive,
                count(*) filter (where lower(coalesce(lead_category,'')) = any($4))::int as negative,
                count(*) filter (where lower(coalesce(lead_category,'')) = 'meeting booked')::int as booked
         from contacts where client_slug=$1 and created_at is not null
         group by 1 order by 1 desc limit $2`, [slug, weeks, POSITIVE, NEGATIVE]),
      // real "no" threads to read the objections (full-thread conversation, not truncated at msg 1)
      q(`select company, title as job_title, lead_category, copy_variant, campaign_name,
                left(coalesce(conversation,''), 900) as conversation_snippet,
                to_char(created_at, 'YYYY-MM-DD') as created
         from contacts
         where client_slug=$1 and lower(coalesce(lead_category,'')) in
               ('not interested','objection handling','disqualified','wrong number')
         order by created_at desc nulls last limit 20`, [slug]),
    ]);

    return NextResponse.json({
      client: slug,
      window_weeks: weeks,
      source: "contacts (all categorized replies)",
      totals: totals[0] || {},
      by_category_all_time: byCategory,
      by_category_recent: recentByCategory,
      lost_reasons: byLostReason,
      weekly,
      no_examples: noExamples,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
