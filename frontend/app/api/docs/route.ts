import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/docs — the self-describing index of the Evergreen API. One fetch and a client
// (or Claude) can see every endpoint, what it does, its params, and which job it belongs to.
// Grouped by role. Numbers-only endpoints are the "stats" group; evidence/knowledge is
// "research"; writing/ingestion is "actions". Internal/walled-off routes (bug tickets, slack
// webhook, cron) are intentionally omitted — they are not part of the AI surface.
export async function GET() {
  const base = process.env.EVERGREEN_PUBLIC_URL || "https://knowledgebase-production-f52e.up.railway.app";

  const docs = {
    api: "Scaletopia Evergreen",
    base_url: base,
    what_it_is:
      "First-party memory + stats for cold-outreach. Evergreen is the info/research PROVIDER, " +
      "not the copywriter: it serves numbers and evidence; a separate copywriter skill writes from them.",
    conventions: {
      body: "JSON on POST",
      windows: "period windows: today, yesterday, this_week, last_week, this_month, last_month, last_7d, last_30d, all_time (week = Mon..Sun, business tz)",
      pr: "PR = positive reply = every deal (a deal IS a PR). power_requests is a separate narrower sub-count.",
      sent: "period sent = messages from the ops daily feed; campaign lifetime sent = leads (~2 texts/lead on SMS).",
      search: "POST /api/search is meaning-search only — NEVER use it to count or measure.",
    },

    // ---- NUMBERS / PERFORMANCE (use the evergreen-stats skill) ----
    stats: [
      { m: "GET", path: "/api/period", summary: "AGENCY-WIDE totals for a window (all clients): sent, prs, power_requests, booked, pr_per_send. The one call for 'how many did WE send/get last week'.", params: "window, channel=sms|email, by=client" },
      { m: "GET", path: "/api/clients/{slug}/period", summary: "Same, for one client. Sent from the daily feed; correct source for 'SMS sent this week' + positive-per-SMS.", params: "window, channel" },
      { m: "GET", path: "/api/clients/{slug}/stats", summary: "Live Airtable KPIs + campaign list with status (PROCESSING/COMPLETED/PAUSED). Its period sent is a rollup that can lag — for period sent use /period.", params: "slug" },
      { m: "GET", path: "/api/clients/{slug}/report", summary: "Per-campaign workhorse: sent, positives, power_requests, booked, replies, bounces, reply_rate_pct, bounce_rate_pct, power_rate_pct, vs_client_avg, live_copy; plus kpi + trend.", params: "channel, q, granularity=day|week" },
      { m: "GET", path: "/api/clients/{slug}/monthly", summary: "Month-by-month trend: per-month sent/prs/booked and pr_per_send, split sms/email, with peaks.", params: "months, channel" },
      { m: "GET", path: "/api/clients/{slug}/benchmarks", summary: "Client rate vs its niche vs the whole book. NOTE positive_rate here is PER LEAD (≠ /period per message).", params: "slug" },
      { m: "GET", path: "/api/clients/{slug}/variant-performance", summary: "Which variant/arm won inside a campaign, recovered from what was actually sent. Check `confidence` — 'directional' = thin sample, no winner. The AUTHORITY for variants.", params: "campaign | campaignId" },
      { m: "GET", path: "/api/clients/{slug}/copy-performance", summary: "Per (campaign, saved-variant A/B) positives. Can DISAGREE with variant-performance (different grouping); trust variant-performance for 'which won'.", params: "weeks" },
      { m: "GET", path: "/api/clients/{slug}/replies", summary: "Reply-reason analytics: why people are replying / saying no, by category.", params: "slug" },
      { m: "POST", path: "/api/clients/{slug}/reply-diagnosis", summary: "Why a campaign isn't working — reads the actual inbound replies and buckets the failure (opt-out, wrong contact, etc.).", params: "body: {campaign}" },
      { m: "GET", path: "/api/churn", summary: "Churned/paused client cohort with pre-churn performance: tenure, lifetime rate, drying_up trend.", params: "status=churned|paused, niche" },
      { m: "POST", path: "/api/prospects/lookup", summary: "Have we already touched these companies, and at what stage.", params: "body: {companies:[...]}" },
    ],

    // ---- EVIDENCE / KNOWLEDGE (use the evergreen-research skill) ----
    research: [
      { m: "POST", path: "/api/search", summary: "Semantic search over the knowledge graph. types: copies, pains, case_studies, components, offers, deals, contacts, slack, guidelines, materials, drafts. Meaning-search ONLY, never for counts.", params: "body: {type, query, limit, route, niche, nicheId, subNicheId, status}" },
      { m: "GET", path: "/api/clients", summary: "List all clients with corpus counts (source of slugs).", params: "-" },
      { m: "GET", path: "/api/clients/{slug}", summary: "Full client detail: pains, caseStudies, calls, campaigns, niche brain, guidelines, materials.", params: "slug" },
      { m: "GET", path: "/api/clients/{slug}/contacts", summary: "Categorized reply threads (incl. negatives). Read the actual conversations.", params: "category" },
      { m: "GET", path: "/api/clients/{slug}/copies", summary: "A client's stored copies.", params: "slug" },
      { m: "GET", path: "/api/clients/{slug}/deals", summary: "Live deals for a client from Airtable, every field exposed.", params: "slug" },
      { m: "POST", path: "/api/clusters", summary: "Dominant pains across a niche (client_count>1 = validated across clients).", params: "body: {niche}" },
      { m: "GET", path: "/api/niches", summary: "Canonical niche tree (ids for exact scoping).", params: "-" },
      { m: "GET", path: "/api/graph", summary: "Bulk knowledge-graph load (~10 whole-table queries) for orientation.", params: "-" },
      { m: "GET|POST|PATCH", path: "/api/guidelines", summary: "Saved rules/preferences per client (+ globals). POST to save 'into Evergreen', PATCH {active:false} to retire.", params: "client; body: {client_slug|null, kind, guideline_text, context}" },
      { m: "GET|POST|DELETE", path: "/api/materials", summary: "Client materials (proposal/positioning/voice/pricing/audit/…). The client's own voice for writing from.", params: "client; body: {client_slug, title, material_type, context, content}" },
      { m: "GET|POST|DELETE", path: "/api/drafts", summary: "Research scratchpad, works for clients not yet onboarded.", params: "client" },
    ],

    // ---- WRITE / INGEST (save results and feed the base) ----
    actions: [
      { m: "POST", path: "/api/agents/save-copy", summary: "Save a finished/launched copy as draft, linked to a campaign so it inherits real stats.", params: "body: {client_slug, t1, t2, lever, persona, niche, status, variant, campaignId|campaignName, components}" },
      { m: "POST", path: "/api/copy/link", summary: "Link a stored copy to a campaign.", params: "body: {copyId, campaignId}" },
      { m: "POST", path: "/api/agents/onboarding", summary: "Onboard a new client (roster + niche resolution).", params: "body: onboarding payload" },
      { m: "POST", path: "/api/agents/transcript", summary: "Ingest a sales-call transcript.", params: "body: transcript" },
      { m: "POST", path: "/api/agents/case-study", summary: "Ingest a case study.", params: "body: case study" },
      { m: "POST", path: "/api/agents/campaign-sync", summary: "Sync a client's campaigns from Airtable.", params: "body: {slug}" },
      { m: "POST", path: "/api/agents/niche-synth", summary: "(Re)synthesize a niche brain.", params: "body: {niche}" },
      { m: "PATCH", path: "/api/clients/{slug}/niche", summary: "Human override of a client's niche.", params: "body: {niche_id, sub_niche_id}" },
      { m: "PATCH", path: "/api/clients/{slug}/status", summary: "Set client active/past (+ churnedAt).", params: "body: {status, churnedAt}" },
      { m: "GET|DELETE", path: "/api/calls", summary: "List / delete ingested call transcripts.", params: "id (delete)" },
    ],

    skills: {
      "evergreen-stats": "numbers/performance — uses the `stats` group above",
      "evergreen-research": "pull + save evidence — uses the `research` and save parts of `actions`",
      note: "The copywriter is a SEPARATE skill; Evergreen only provides. See /api/openapi for the formal OpenAPI 3.1 spec.",
    },
  };

  return NextResponse.json(docs);
}
