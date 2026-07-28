import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reply diagnosis: "why isn't this campaign working." Reads the actual inbound replies
// for a client (optionally one campaign / recent weeks), buckets the REASON behind each
// (wrong contact, already solved, not interested, timing, price, hostile, opt-out, ...),
// and returns the breakdown with example quotes. The automated version of a manual
// reply read. Deterministic keyword classification — fast, no LLM.
//
// POST /api/clients/{slug}/reply-diagnosis  { "campaign"?: "...", "weeks"?: 8 }

const MARKER = /(Outbound|Inbound)\s*-\s*[^\n]*?(?:said|wrote)\s*:/gi;
function inboundText(conv: string): string {
  if (!conv) return "";
  const parts = conv.split(MARKER);
  const out: string[] = [];
  for (let i = 1; i < parts.length - 1; i += 2) {
    if (/inbound/i.test(parts[i])) out.push((parts[i + 1] || "").trim());
  }
  return out.join("  ").toLowerCase();
}

// reason buckets, checked in priority order (first match wins)
const REASONS: { key: string; label: string; re: RegExp }[] = [
  { key: "hostile", label: "Hostile / spam-flagged", re: /\bf+u+c+k|spam|scam|\bwtf\b|stop texting|piss off|harass|pervert|leave me alone|report you/i },
  { key: "opt_out", label: "Opt-out (STOP/remove)", re: /\bstop\b|unsubscribe|remove( me|d)?\b|take me off|opt.?out|do not (text|contact|message)|don'?t (text|contact|message) me|\bdnd\b|lose my number/i },
  { key: "wrong_contact", label: "Wrong contact (not the person)", re: /wrong number|don'?t work (here|there)|no longer (with|here|employ)|i am not\b|i'?m not \w+|not me\b|personal (cell|number|phone)|retired|not in sales|not a sales|different company|reached the wrong|this isn'?t|not the right person/i },
  { key: "wrong_fit", label: "Wrong fit / industry", re: /we don'?t (sell|do|have|run)|not that kind|not a (roofer|dealer|car)|private label|not relevant|doesn'?t apply|we are a|not in the (us|states|country)|where are you (located|based)/i },
  { key: "already_solved", label: "Already has a solution", re: /already (have|got|use|using|working|running)|we use|we already|have a (tool|team|solution|agency|vendor|partner)|in.?house|handled internally|got (that|it) covered|current (agency|vendor|provider)|happy with/i },
  { key: "price_budget", label: "Price / budget", re: /\bbudget\b|too expensive|can'?t afford|pricing|too much|no money|cost too|zero spend|no spend|not spending/i },
  { key: "timing", label: "Bad timing / not now", re: /not right now|maybe later|next (quarter|year|month)|circle back|reach (out|back) (in|later)|too busy|swamped|on vacation|day off|revisit|down the (road|line)|in (a few|six|three|\d+) (months?|weeks?)|later this year|at capacity|booked (out|up)|not this (year|quarter)/i },
  { key: "how_got_number", label: "Confused / how'd you get my #", re: /how did you get|where did you get|who is this\b|who'?s this|why (are|r) you (texting|messaging)|what is this|what'?s this (about|regarding)|never (signed|gave|opted)|do i know you/i },
  { key: "not_interested", label: "Not interested", re: /not interested|no,? thanks?|no thank you|not looking|all set|we'?re good|we are good|\bpass\b|no need|not for us|no interest|we don'?t need|^no\b|^n\/?a$|not at this time/i },
  { key: "positive", label: "Positive / wants info", re: /interested|tell me more|more info|how does|what('?s| is) the|send (it|me|over|some|the)|sounds (good|interesting)|let'?s|worth a|book|call me|reach me|my number|sure\b|^yes\b|keen\b|link to your|schedule|set (up|something)/i },
];
function classify(text: string): string {
  if (!text || text.length < 2) return "no_text";
  for (const r of REASONS) if (r.re.test(text)) return r.key;
  return "other";
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug;
  const body = await req.json().catch(() => ({}));
  const campaign = body.campaign as string | undefined;
  const weeks = Number(body.weeks) || 0;

  const where = ["client_slug = $1", "conversation is not null", "length(conversation) > 40"];
  const args: any[] = [slug];
  if (campaign) { args.push(`%${campaign}%`); where.push(`campaign_name ilike $${args.length}`); }
  if (weeks) where.push(`created_at >= now() - interval '${weeks} weeks'`);

  try {
    const rows = await q<any>(
      `select company, lead_category, campaign_name, conversation
       from contacts where ${where.join(" and ")} limit 5000`, args);

    const byCategory: Record<string, number> = {};
    const buckets: Record<string, { count: number; examples: { company: string; quote: string }[] }> = {};
    let withReply = 0;

    for (const r of rows) {
      if (r.lead_category) byCategory[r.lead_category] = (byCategory[r.lead_category] || 0) + 1;
      const reply = inboundText(r.conversation);
      if (!reply) continue;
      withReply++;
      const key = classify(reply);
      const b = (buckets[key] = buckets[key] || { count: 0, examples: [] });
      b.count++;
      if (b.examples.length < 4) b.examples.push({ company: r.company || "?", quote: reply.slice(0, 140) });
    }

    const labelOf: Record<string, string> = Object.fromEntries(REASONS.map((r) => [r.key, r.label]));
    labelOf["other"] = "Other / unclear"; labelOf["no_text"] = "No readable reply";
    const reasons = Object.entries(buckets)
      .map(([key, v]) => ({
        reason: labelOf[key] || key, key, count: v.count,
        pct: withReply ? Math.round((v.count / withReply) * 1000) / 10 : 0,
        examples: v.examples,
      }))
      .sort((a, b) => b.count - a.count);

    const neg = reasons.filter((r) => !["positive"].includes(r.key)).reduce((s, r) => s + r.count, 0);
    return NextResponse.json({
      client: slug, campaign: campaign || "all", weeks: weeks || "all-time",
      total_replies_analyzed: withReply,
      by_lead_category: byCategory,
      negative_share_pct: withReply ? Math.round((neg / withReply) * 1000) / 10 : 0,
      reasons,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
