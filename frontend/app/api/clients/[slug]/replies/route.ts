import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// Reply-reason analytics ("inbox-lite"): why are people replying / saying no.
// Reads the persisted deals table. ?weeks=4 (default) windows recent activity;
// totals are all-time. Example threads included for the "no" buckets.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const weeks = Math.min(52, Number(new URL(req.url).searchParams.get("weeks")) || 4);
  try {
    const [byCategory, byLostReason, recentByCategory, weekly, noExamples] = await Promise.all([
      q(`select coalesce(positive_reply_category,'(uncategorized)') as category, count(*)::int as n
         from deals where client_slug=$1 group by 1 order by n desc`, [slug]),
      q(`select lost_reason, count(*)::int as n from deals
         where client_slug=$1 and lost_reason is not null group by 1 order by n desc`, [slug]),
      q(`select coalesce(positive_reply_category,'(uncategorized)') as category, count(*)::int as n
         from deals where client_slug=$1 and deal_created_at > now() - ($2 || ' weeks')::interval
         group by 1 order by n desc`, [slug, String(weeks)]),
      q(`select to_char(date_trunc('week', deal_created_at), 'YYYY-MM-DD') as week_start,
                count(*)::int as replies,
                count(*) filter (where lower(coalesce(positive_reply_category,'')) in
                  ('power request','positive','meeting booked'))::int as power,
                count(*) filter (where lower(coalesce(positive_reply_category,'')) = 'not interested')::int as not_interested,
                count(*) filter (where lower(coalesce(stage,'')) in
                  ('meeting booked','show','won'))::int as booked
         from deals where client_slug=$1 and deal_created_at is not null
         group by 1 order by 1 desc limit $2`, [slug, weeks]),
      q(`select company, job_title, positive_reply_category, lost_reason, variant, campaign_name,
                left(coalesce(conversation,''), 500) as conversation_snippet,
                to_char(deal_created_at, 'YYYY-MM-DD') as created
         from deals
         where client_slug=$1
           and (lower(coalesce(positive_reply_category,'')) in ('not interested','objection handling')
                or lost_reason is not null)
         order by deal_created_at desc nulls last limit 15`, [slug]),
    ]);

    return NextResponse.json({
      client: slug,
      window_weeks: weeks,
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
