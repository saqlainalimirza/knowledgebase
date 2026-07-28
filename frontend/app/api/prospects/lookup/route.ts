import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Prospect-history lookup (Aaman's #1 GTM task). Given a list of company names, return
// each one's touch history in a client's deals: first/last touch, furthest stage, whether
// we had a call, who we already reached, and the suggested next contact. DETERMINISTIC
// matching (normalized string), NOT semantic search — so it's instant and doesn't wander.
//
// POST /api/prospects/lookup  { "client"?: "scaletopia", "companies": ["Amsive", ...] }

const SUFFIXES = /\b(inc|inc\.|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|incorporated|group|holdings|the)\b/gi;
const norm = (s: string) =>
  (s || "").toLowerCase().replace(SUFFIXES, "").replace(/[^a-z0-9]+/g, " ").trim();

function companyMatch(prospect: string, record: string): boolean {
  const a = norm(prospect), b = norm(record);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}

// furthest stage reached (higher = further down the funnel)
function stageRank(stage: string | null): number {
  const t = (stage || "").toLowerCase();
  if (/won|closed/.test(t)) return 7;
  if (/\bshow\b/.test(t) && !/no.?show/.test(t)) return 6;
  if (/meeting|booked/.test(t)) return 5;
  if (/positive/.test(t)) return 4;
  if (/maybe/.test(t)) return 3;
  if (/no.?show/.test(t)) return 2;
  if (/lost|disqualif|dead/.test(t)) return 1;
  return 0;
}

const SEN_RANK: Record<string, number> = { manager: 1, director: 2, vp: 3, exec: 4, c_level: 5, founder: 6 };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const client = body.client || "scaletopia";
    const companies: string[] = (body.companies || []).map((c: any) => String(c).trim()).filter(Boolean);
    if (!companies.length) return NextResponse.json({ error: "pass companies: [...]" }, { status: 400 });

    const [deals, contacts, calls] = await Promise.all([
      q<any>(`select company, contact, job_title, seniority, stage, positive_reply_category,
                     lost_reason, campaign_name, deal_created_at, meeting_booked_at
              from deals where client_slug=$1 and company is not null`, [client]),
      q<any>(`select company, name, title, seniority, lead_category, campaign_name, created_at
              from contacts where client_slug=$1 and company is not null`, [client]),
      q<any>(`select title, source_call_id from client_calls where client_slug=$1`, [client]),
    ]);

    const results = companies.map((company) => {
      const md = deals.filter((d) => companyMatch(company, d.company));
      const mc = contacts.filter((c) => companyMatch(company, c.company));
      const mcall = calls.filter((c) => companyMatch(company, c.title || "") || companyMatch(company, (c.source_call_id || "").replace(/_/g, " ")));

      if (!md.length && !mc.length && !mcall.length)
        return { company, matched: false, note: "no prior touch found — fresh prospect" };

      // touch dates
      const dates = [
        ...md.map((d) => d.deal_created_at), ...md.map((d) => d.meeting_booked_at),
        ...mc.map((c) => c.created_at),
      ].filter(Boolean).map((x) => new Date(x).getTime());
      const first = dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null;
      const last = dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null;

      // furthest stage
      const best = md.slice().sort((a, b) => stageRank(b.stage) - stageRank(a.stage))[0];

      // who we reached (dedup by name)
      const seen = new Set<string>();
      const contactsReached: any[] = [];
      let maxSen = 0;
      for (const r of [...md, ...mc]) {
        const name = r.contact || r.name;
        const title = r.job_title || r.title;
        const key = (name || "") + "|" + (title || "");
        if (!name || seen.has(key)) continue;
        seen.add(key);
        contactsReached.push({ name, title: title || null, seniority: r.seniority || null });
        maxSen = Math.max(maxSen, SEN_RANK[r.seniority] || 0);
      }

      const outcomes = Array.from(new Set([
        ...md.map((d) => d.positive_reply_category).filter(Boolean),
        ...md.map((d) => d.lost_reason).filter(Boolean),
        ...mc.map((c) => c.lead_category).filter(Boolean),
      ]));
      const campaigns = Array.from(new Set([...md, ...mc].map((r) => r.campaign_name).filter(Boolean)));

      const suggested = maxSen >= 5
        ? "Already reached founder/C-level — follow up that thread, don't restart cold"
        : maxSen > 0
          ? "Already reached " + Object.keys(SEN_RANK).find((k) => SEN_RANK[k] === maxSen) + "-level — go higher: co-founder / SVP biz dev"
          : "Touched before but no senior contact logged — target the founder / SVP directly";

      return {
        company,
        matched: true,
        touches: md.length + mc.length,
        first_touch: first,
        last_touch: last,
        furthest_stage: best?.stage || null,
        had_call: mcall.length > 0,
        call: mcall.length ? { title: mcall[0].title } : null,
        contacts_reached: contactsReached,
        outcomes,
        campaigns,
        suggested_next: suggested,
      };
    });

    const matched = results.filter((r) => r.matched).length;
    return NextResponse.json({ client, count: results.length, matched, fresh: results.length - matched, prospects: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
