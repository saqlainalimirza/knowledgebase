---
name: evergreen-data
description: "Data supply for copywriting and research: pull real pains, buyer lingo, tiered proof, winning/losing copy, niche intelligence, live campaign stats, and the knowledge graph from Scaletopia's Evergreen API. This skill does NOT write copy and does not impose a copywriting method. Your own playbook decides how to write; this skill documents every endpoint in full detail so you can fetch evidence from anywhere in the system, read its quality signals, and save finished copy back. Triggers on 'get data for', 'brief me on {client}', 'what works for {niche}', 'pull pains/proof/winners', or any task needing Evergreen data."
---

# Evergreen Data Supply

Your copywriting method comes from YOUR playbook. This skill covers: how to **fetch**
from every endpoint, how to **read the quality signals**, and how to **save** results back.

**Base URL (live):** `https://knowledgebase-production-f52e.up.railway.app`
All paths below are relative to it. All bodies are JSON (`Content-Type: application/json`).
Independent calls can be fired in parallel. Machine-readable spec: `GET /api/openapi`.

---

# BEFORE YOU WRITE ANY COPY (do this every time, no exceptions)

The system holds the game tape; press play before writing. For the target client, fetch
these FOUR in parallel and write from them, not from any local cheat-sheet:

1. **Winners** — `POST /api/search {"type":"copies","query":"<angle>","status":"winner"}`
   plus their `why_it_worked`. These are real sent copies with per-send performance.
2. **This week's objections** — `GET /api/clients/{slug}/replies` (now sourced from ALL
   categorized replies incl. negatives). Read `no_examples` + `by_category_recent`; your
   copy must pre-empt what people actually reply.
3. **The client's voice/identity** — `GET /api/clients/{slug}` `materials`, or
   `POST /api/search {"type":"materials"}` for positioning/voice.
4. **Saved guidelines** — `GET /api/guidelines?client={slug}` (the strategist's standing
   rules and preferences; newer wins).

If you skip these, you are writing blind. After writing, SAVE it (see save-copy) so the
loop compounds.

---

# COMMON QUESTIONS → ONE CALL (do not explore; call the exact endpoint)

Most strategist questions are ONE Evergreen call. Answer in one; do NOT bulk-pull
deals/contacts and analyze by hand, and do NOT fall back to GHL/Airtable MCP for these.

| The question | Make exactly this call |
|---|---|
| "copy + stats of {client}'s campaigns" (SMS/email/BD/etc.) | `GET /api/clients/{slug}/report?channel=sms&q=BD` (server-side filter) |
| "which variant / copy performed better for {client}" | `GET /api/clients/{slug}/copy-performance` |
| "which VARIANT / CTA arm inside {campaign} won" | `GET /api/clients/{slug}/variant-performance?campaign={name}` (variant recovered from the sent copy) |
| "which CTA / hook / lever performed better" | `POST /api/search {"type":"copies","client":"{slug}"}` → group results by `cta`/`lever`, compare `positive_rate`/`power_rate` |
| "why isn't {campaign} working" | `GET /api/clients/{slug}/reply-diagnosis` |
| "have we touched these companies / what stage" | `POST /api/prospects/lookup {"companies":[...]}` |
| "weekly report for {client}" | `GET /api/clients/{slug}/report` + `GET /api/clients/{slug}/benchmarks` |
| "why are people saying no / reply reasons" | `GET /api/clients/{slug}/replies` |

If a question maps to a row here, make THAT call first. Exploring the graph or scanning
raw deals for these is the slow path and is wrong.

---

# DATA HIERARCHY — read this before fetching anything (avoids MCP over-pulling)

Evergreen already mirrors the CRM data. **Get reply/deal/stat data from Evergreen, NOT
from GoHighLevel / Smartlead / Airtable MCP.** Those MCPs are live production systems our
automations depend on; bulk-pulling from them (e.g. "get last week's messages" fanning out
to 12,000 records) burns API credits and can take Airtable/GHL down. Route by question:

| You want… | Use | Endpoint |
|---|---|---|
| Winning replies / booked meetings / deal outcomes, with variant + full thread | **deals** | `GET /api/clients/{slug}/deals`, `POST /api/search {"type":"deals"}` |
| ALL replies by category (Not Interested, Objection Handling, Positive, Maybe, Power Request…), negative-reply threads, "why aren't people responding" | **contacts** | `GET /api/clients/{slug}/contacts`, `POST /api/search {"type":"contacts"}` |
| Overall performance (sent, positives, booked, conversion, KPIs) | **stats** | `GET /api/clients/{slug}/stats`, campaigns in `GET /api/clients/{slug}` |
| **Client report** — the copy actually running per campaign + its performance + KPIs vs target | **report** | `GET /api/clients/{slug}/report` |
| Reply-reason analytics for a client (categories, lost reasons, trend) | **replies** | `GET /api/clients/{slug}/replies` |
| Pains / lingo / proof / copy / offers / Slack / guidelines / materials | Evergreen search | `POST /api/search` (see types below) |
| **Prospect research** — "have we touched these companies, what stage, who did we reach" | **prospects/lookup** | `POST /api/prospects/lookup` (do NOT semantic-search deals for this) |

**Rule:** try Evergreen first. Only fall back to GHL/Airtable/Smartlead MCP for something
Evergreen genuinely does not have (e.g. a single live record by id), and never bulk-pull.
`deals` = the subset that became opportunities. `contacts` = every categorized reply
(bigger). For counts/breakdowns use the aggregates the endpoints return — don't fetch
thousands of rows to count them yourself.

---

# WHAT'S NEW (July 20 update)

1. **GUIDELINES — your persistent memory across sessions.** You now have a place to
   remember how each client's copy should be built. THE WORKFLOW:
   - **Before writing copy for a client, ALWAYS fetch their guidelines first**:
     `GET /api/guidelines?client={slug}` (returns that client's + global ones, newest
     first). Client detail (`GET /api/clients/{slug}`) also includes them as `guidelines`.
     Treat them as standing instructions from the strategist. Newer entries win when
     they conflict with older ones.
   - **When the strategist says "save this into Evergreen" (or you learn what they like),
     save it**: `POST /api/guidelines` with
     `{"client_slug":"kynship"|null, "kind":"preference|process|rule|learning",
       "guideline_text":"...", "context":"where this came from", "source":"aaman"}`
     (`client_slug: null` = global, applies to every client; body can also be a list).
     Save each distinct instruction as its OWN item, in your words, specific enough to
     act on next session. Anything can be a guideline: word choices, structure rules,
     process steps ("always check replies before drafting"), things that failed.
   - Semantic search over them: `POST /api/search {"type":"guidelines", ...}`.
   - **Two more lanes live in the SAME guidelines store — separate them with `?kind=`:**
     - **GTM memory** (`kind:"gtm_memory"`) — durable facts/decisions per client you'd
       otherwise keep re-deriving: who the real decision-maker is, outreach cadence, what's
       already been tried, positioning that landed. **Load before ANY GTM / prospecting
       work:** `GET /api/guidelines?client={slug}&kind=gtm_memory,audit`. Save one whenever
       you learn something durable (`POST` with `kind:"gtm_memory"`).
     - **Audit / test log** (`kind:"audit"`) — a campaign problem + what to test next. Put
       the campaign name in `context`, the observation + hypothesis in `guideline_text`
       (e.g. "spam-flagged + 0 positives → test a softer, non-salesy opener"). It stays OPEN
       while active; once tested/resolved, retire it with `PATCH {id, active:false}`. This
       pairs with reply-diagnosis (5c): diagnose why a campaign fails → log the fix to test
       → resolve it when it's fixed. Copy tasks can ignore this lane by fetching
       `?kind=preference,process,rule,learning`.
2. **Slack is in the memory**: `POST /api/search {"type":"slack"}` searches 2,500+
   messages from every client's Slack channel (client feedback, campaign updates,
   "don't book these people" style instructions). Check it when briefing on a client.
3. **MATERIALS — client context documents.** Proposals, audits, scraped website info,
   brochures, pricing docs now live in the system, each with a `context` line saying what
   the document is ("the audit deck sent after discovery calls").
   - Browse: `GET /api/materials?client={slug}` (metadata + preview);
     `GET /api/materials?client={slug}&id={id}` for full content.
   - Semantic search: `POST /api/search {"type":"materials","query":"..."}` — returns
     chunks with `client_slug, title, material_type, context, chunk_text, score`.
     Use this to understand how a client positions themselves, their offer wording,
     pricing, and proof — before writing as-them. This is the client's IDENTITY layer
     (their proposals, positioning, pricing, voice). Client detail
     (`GET /api/clients/{slug}`) now lists a client's materials (title, type, context,
     preview) so you see at orientation what identity docs exist; pull full content with
     `?id=` or the materials search. When writing AS a client, read their positioning/voice
     materials first — this is what separates their real voice from generic copy.
   - Ingest: `POST /api/materials {"client_slug","title","material_type":
     "proposal|positioning|voice|audit|web_scrape|brochure|pricing|other","context","content"}`.
     Same title re-uploads replace the old version.
4. Client Slack channels sync daily; deals/campaign stats sync daily as before.
5. **Winners/losers live HERE, not in local CSVs.** Copy search returns them with
   why-it-worked/failed, patterns and real performance. Never read copy CSVs from disk;
   they are the raw source and go stale. New copies are saved at launch via save-copy.

# WHAT'S NEW (July 13 update — adapt your playbook to these)

1. **Deals are in the system now** (3,296 deals, all clients). Two new tools:
   - `GET /api/clients/{slug}/deals` — every deal with stage, **copy variant**, job title,
     company, campaign, conversation. Pre-filter with `?stage= ?variant= ?channel=`.
   - `POST /api/search {type:"deals"}` — **semantic search over 2,393 real reply
     conversations**. Query things like "price objection handled then meeting booked" and
     read the actual threads. Use these to study HOW winning conversations go, not just
     which copy won.
2. **Reply-reason analytics**: `GET /api/clients/{slug}/replies` — why people reply / say
   no (categories, lost reasons, weekly trend, recent "no" threads). Check this before
   writing for a client: the objections in there are what your copy must pre-empt.
3. **Campaign performance is queryable**: client detail (`GET /api/clients/{slug}`)
   campaigns now carry `sent, positive_replies, power_requests, booked, power_rate`
   (power requests ÷ sent — reply QUALITY). Sorted by power. Lead with what's winning.
4. **Variants**: copies carry `variant` (A/B/C). Pass `variant` when saving copy. Copy
   metrics are variant-accurate where deals carry the variant.
5. **Ranking changes**: copy `weight` performance now scores bookings (0.5) > power
   requests (0.3) > raw positives (0.2), per send, sample-adjusted. Copies from PAST
   clients (Tiger Tracks, Velox, etc.) are auto-downweighted ×0.6 — treat them as
   reference, not gospel.
6. **Offers**: `POST /api/search {type:"offers"}` — each client's offers with a `service`
   category (seo, local_seo, paid_ads, tiktok_shop, ...) that cross-connects clients
   selling the same thing, plus the case study that proves each offer (`proof_hint`).
7. **Exact niche filters**: pass `nicheId`/`subNicheId` (ids from `GET /api/niches`) in
   search for canonical scoping instead of fuzzy text.

---

# Client directory (slug + Airtable record id)

`slug` is the key for API calls; the Airtable `rec...` id is the same client in the
Airtable base (used by campaign-sync and Airtable lookups).

**Active clients (loaded in the system):**
| Client | slug | Airtable rec id | Niche |
|---|---|---|---|
| Big Leap | `big_leap` | `recEBLuz8F9yx0ab8` | DTC ecom |
| Chamber Media | `chamber_media` | `recL0ZcxKPJidtffg` | DTC ecom |
| Digital Resource | `digital_resource` | `rec6Oa7G63G2i65jZ` | dental / local |
| Go Fish Digital | `go_fish` | `recs9ySihyEMnh9I5` | DTC ecom |
| Growth Lab | `growth_lab` | `recd8uFihKQ4h44Kr` | Law firms |
| Kynship | `kynship` | `recncshNnMmK4OTei` | DTC ecom |
| Leadgenix | `leadgenix` | `recQdK3OzylmDH2mT` | Local businesses |
| Redo | `redo` | `rec6AI1zzahdLCTvH` | DTC ecom |
| Scaletopia | `scaletopia` | `recXQrfQPnKdNGQUh` | Marketing agencies |
| SeedX | `seedx` | `recvDnh3RA4CWnTjR` | B2B SaaS |
| Wise Digital Partners | `wise_digital` | `recQQkheKwE77cFn8` | professional services |

**Active in Airtable but NOT loaded in the system yet** (no knowledge data; onboard first):
| Client | Airtable rec id |
|---|---|
| Acceler8 | `recr1b0pyHIEUicu8` |
| Strike Tax Advisory | `rec5ngV4nRxVgFZBA` |
| Taktical Digital | `recsg4HGVxYwag1ff` |

**Past clients (in the system for their winning/losing copies only; no Airtable id):**
`dma`, `exchange_media`, `firecracker`, `pirawna`, `stratedia`, `target_market`,
`tiger_tracks`, `velox` — their copies still surface in copy search as evidence.

The live list is always `GET /api/clients`; prefer it over this table if they disagree.

---

# FULL API REFERENCE (every endpoint, every field)

## 1. `GET /api/clients` — list all clients
No params. Returns an array; counts are strings.
```json
[{ "slug":"kynship", "client":"Kynship", "niche":"DTC ecom", "sub_niche":null,
   "offer":"...", "airtable_client_id":"rec...", "status":"active",
   "calls":"21", "pains":"473", "case_studies":"11", "campaigns":"19" }]
```
Use to discover slugs. `slug` is the key for every other client endpoint.

## 2. `GET /api/clients/{slug}` — full client detail (the orientation call)
Returns one object with these sections:
- `client`: `{slug, client, niche, sub_niche, offer, airtable_client_id, status}`
- `pains` (up to 500): `[{id, kind, persona, item_text, confidence, source}]`
  - `kind`: pain | lingo | dream | belief | objection. `confidence`: confirmed | needs_more.
  - `source`: provenance, e.g. `"call kynship_call8"` (which transcript it was mined from).
- `painKinds`: `[{kind, n}]` counts per kind.
- `caseStudies`: `[{id, subject_brand, tier, after_state, unique_mechanism, timeframe, source_ref}]`
- `calls`: `[{id, title, source, source_call_id, call_date, chunks}]` (`chunks` = number of searchable pieces)
- `campaigns` (up to 200, sorted by power requests): `[{id, name, channel, angle, segment, niche, notes, sent, positive_replies, power_requests, booked, power_rate}]`
  - `id` here is the DB campaign id used by `/api/copy/link` and `save-copy.campaignId`.
  - `power_rate` = power requests ÷ sent — reply quality per send; the best single signal
    for which campaign/angle is actually working.
- `niche`: the niche brain — `{commonalities_summary, top_pains, shared_lingo, dream_outcomes, winning_levers, refreshed_at}` (JSON arrays; null if not built).
- `guidelines`: this client's + global standing instructions (newest first) — read before writing.
- `materials`: this client's identity docs (title, material_type, context, preview).

Note: `client.status = "past"` means a churned client — their data is retained as
reference and their copies are auto-downweighted; treat as evidence, not current gospel.

## 3. `GET /api/clients/{slug}/stats` — LIVE performance from Airtable
No params. Two sections:
- `stats`:
  - `retainer` (number), `accountManager`, `status`, `onboardingDate`, `domain`
  - `activeCampaigns`: `{sms, email}` — currently running counts
  - `leadsRemaining`: `{sms, email}`
  - `periods`: keys `"This Week"`, `"This Month"`, `"All Time"`, each:
    `{ sent:{sms,email,total}, positives:{sms,email,total}, booked:{sms,email,total}, conversion:"25%" }`
  - `kpi`: `{weeklyBooked, monthlyBooked, weeklyPositives}` — the targets
- `campaigns` (live from Airtable, sorted by completed): `[{id (Airtable rec id), name, type ("SMS"|"EmailBison"), status ("ACTIVE"|"PAUSED"|"COMPLETED"|"CANCELLED"|...), totalLeads, completed, completion (0-100), emailsSent, emailReplies, leadsRemaining}]`
Use for: channel choice, what's live right now, real reply/booking volume.

## 4. `GET /api/clients/{slug}/copies` — a client's copies + linkable campaigns
- `copies`: `[{id, status, lever, t1, t2, char_t1, char_t2, campaign_id, campaign_name, positive_rate, sent, booked}]` (metrics null until synced)
- `campaigns`: `[{id, name, channel}]` — DB ids for linking.

## 4b. `GET /api/clients/{slug}/deals` — LIVE deals with full attribution (from Airtable)
Every deal for the client with **every field**, connected to its campaign. Fetch once,
filter however you want. Optional pre-filters: `?stage=Won` `?variant=A`
`?channel=sms|email` `?category=Not Interested` `?limit=500`.

Response: `{ client, count, by_stage, by_variant, by_channel, by_reply_category, deals: [...] }`
(the `by_*` objects are ready-made counts so you can orient without recomputing).

Each deal:
- **outcome**: `stage` (Positive Reply | Meeting Booked | Show | No Show | Won | Lost | Disqualified | "Maybe" | ...), `positive_reply_category` (Power Request | Not Interested | Objection Handling | ...), `lost_reason`, `closed_amount`, `meeting_booked_at`, `meeting_url`
- **attribution**: `channel` (sms|email), **`copy_variant`** (A/B/C — which copy variant drove this deal), `campaign_name`, `campaign_airtable_ids`, **`db_campaign_id`** (matched to our campaigns table; use with `/api/copy/link` data)
- **who converted**: `contact`, **`job_title`**, `company`, `website`, `email`, `linkedin`, `phone`, `location`, `timezone`
- **the story**: `conversation` (the actual reply thread), `recordings`, `notes`, `next_step_no`, `not_closed_reason`, `overall_feedback`

Use for: which variant/campaign actually converts, what job titles reply, why people say
no (`positive_reply_category` + `lost_reason`), and reading the real conversations behind
booked meetings.

## 4c. `GET /api/clients/{slug}/replies` — reply-reason analytics ("why are people saying no")
Optional `?weeks=4` window. Returns:
- `by_category_all_time` + `by_category_recent`: counts per `positive_reply_category`
  (Power Request, Not Interested, Objection Handling, More Info Request, ...)
- `lost_reasons`: counts per lost reason (Couldn't afford, Not interested, ...)
- `weekly`: per-week series `{week_start, replies, power, not_interested, booked}`
- `no_examples`: the 15 most recent "no" threads with company, job_title, variant,
  campaign and a 500-char conversation snippet — read these to understand objections.
Use for: "why are people saying no this week", objection trends, reply-quality tracking.

## 4d. `GET /api/clients/{slug}/report` — the client report (live copy + performance + KPIs)
The one call for "how is this client doing and what copy is actually running." The live
campaign copy is never stored in the CRM (it lives in the sending tools), so we RECONSTRUCT
it from the outbound messages inside the reply threads and link it to the campaign — so each
campaign's stats ARE that copy's performance. Returns:
- `client`: `{slug, name, niche, status}`.
- `kpi` (from the client's Airtable record; null if unavailable): `targets`
  `{weeklyBooked, monthlyBooked, weeklyPositives}`, `this_week` / `this_month`
  `{sent, positives, booked, conversion}`, and `on_track` booleans. The benchmark is the
  client's OWN targets — not invented industry numbers.
- `weekly_trend`: last 8 weeks `[{week, positives, booked}]` from real deal data.
- `campaigns` (sorted by power, dead shells dropped): each with `sent, replies, positives,
  power_requests, booked, power_rate_pct`, **`live_copy`** `{t1, t2, variant, char_t1,
  char_t2, source, reconstructed_at}` (the reconstructed running copy, or null),
  `copy_status` (`reconstructed` | `no_reply_captured`), and `vs_client_avg`
  (`above`|`at`|`below` this client's own average power_rate).
- `summary`: `{campaigns, with_live_copy, avg_power_rate_pct}`.
Use for: writing a client report, spotting which live copy is under/over-performing, grading
the client against their own KPIs. `copy_status: no_reply_captured` = that campaign got no
replies we could mine copy from (copy is only recoverable where at least one lead replied).

## 4e. `GET /api/clients/{slug}/variant-performance?campaign={name}` — which VARIANT/CTA arm won
The sending tool never tags which arm each lead got, so Evergreen RECOVERS the variant from
the copy we actually sent (clusters each lead's outbound opener) and attributes replies to it.
Pass `?campaign={name}` (or `?campaignId={id}`). Returns `{ campaign, significant_variants,
minor_variants_collapsed, verdict, variants:[{variant, reached, positives, booked,
positive_rate_pct, sample_message}] }`. `reached` = leads attributable to a variant (the fair
A/B denominator, not raw sends); noise clusters are collapsed. If a campaign is too small or
had no real A/B, `verdict` says so — it will not invent a winner.

## 4f. `GET /api/clients/{slug}/benchmarks` — is a number good or bad?
Client's send-based `positive_rate/power_rate/book_rate` next to the **niche** and **overall**
benchmarks, plus `vs_niche`/`vs_overall` ratios (>1 beats the benchmark). Use in reporting so
a rate reads as good/bad vs peers instead of a naked number.

## 5. `POST /api/search` — semantic search over any knowledge type (the workhorse)
Body:
```json
{ "type": "pains" | "calls" | "case_studies" | "copies" | "components" | "offers" | "deals" | "slack" | "guidelines" | "materials" | "contacts" | "drafts",
  "query": "plain-english meaning to match",
  "limit": 10,
  "route": true,
  "niche": "DTC ecom",
  "nicheId": 1, "subNicheId": 3,
  "status": "winner" }
```
- `type` + `query` required. `limit` = the amount dial (everything is ranked, so small limits return the best few).
- `route:true` = auto-match the query to the best niche first (recommended when no niche given).
- `niche` = pin by niche text (skips routing). `nicheId`/`subNicheId` = EXACT canonical ids from `/api/niches` (work on pains + case_studies).
- `status` = copies only (winner | loser | draft | neutral).

Response: `{ "type", "query", "routed": [{"niche","score"}], "results": [...] }`
(`routed` shows which niche(s) the query was scoped to when `route:true`.)

**Result fields per type:**
- `pains`: `id, client_slug, kind, persona, item_text, confidence, created_at, score, recency, weight` — sorted by `weight = score × confidence × recency`.
- `calls`: `id, client_slug, chunk_text, score` — raw conversation excerpts; best for exact buyer phrasing and context around a topic.
- `case_studies`: `id, client_slug, subject_brand, tier, after_state, unique_mechanism, created_at, score, recency, weight` — sorted by `weight = score × tier × recency`.
- `copies`: `id, client_slug, status, variant, lever, pattern, sophistication, t1, t2, unique_mechanism, pattern_interrupt, cta, why_it_worked, why_it_failed, created_at, score` plus (when the copy is linked to a campaign) `positive_rate, positives, sent, booked, power_requests, power_rate` plus computed `performance, recency, aged, weight` — sorted by `weight`. **`why_it_worked` / `why_it_failed` are the richest fields; always read them.** `power_rate` = power requests ÷ sent (reply QUALITY, the metric that matters more than raw positives). Copies from past clients are automatically downweighted.
- `components`: `id, component_type (disarmer|identity|case_line|unique_mechanism|relevance|cta), item_text, verdict (winner|loser|neutral), persona, lever, score` — swipeable individual parts.
- `deals`: `id, client_slug, company, contact, job_title, job_function, seniority, stage, positive_reply_category, lost_reason, variant, channel, campaign_name, conversation (first 2000 chars), score` —
  **semantic search over the actual reply conversations.** Ask things like "price objection
  handled successfully" or "asked to email instead" and get the real threads. Combine with
  filters client-side: e.g. keep `stage in (Meeting Booked, Won)` to study what conversations
  that BOOK look like, or `positive_reply_category = Not Interested` to study why people say no.
- `contacts`: `id, client_slug, name, title, job_function, company, lead_category, channel,
  campaign_name, copy_variant, conversation, created_at, score` — semantic search over
  categorized reply threads (not just deals). Query e.g. "price objection then went quiet"
  and read the actual threads. NOTE: only positive/meaningful categories are vector-indexed;
  most negatives (Not Interested / Neutral / Disqualified) are NOT semantically searchable
  (cost control). To work with negatives, don't rely on this search — use reply-diagnosis
  (5c) for the "why", or `GET /api/clients/{slug}/contacts?category=Not%20Interested` to pull
  and read the actual negative threads directly (that endpoint covers every category).
- `slack`: `id, client_slug, user_name, text, created_at, score` — semantic search over each
  client's Slack channel (feedback, campaign discussions, updates the team posted). Empty
  until the Slack sync is enabled.
- `offers`: `id, client_slug, offer_text, service, pattern, mechanism, proof_hint, score` —
  what each client pitches. **`service`** is the cross-client key (seo | local_seo |
  paid_ads | creative | tiktok_shop | amazon | pr | email_sms_marketing | web_design |
  cro | returns_software | other): when an offer works for one client, search offers by
  the same `service` to find every other client selling the same thing (e.g. a local-SEO
  win for Leadgenix transfers to Digital Resource). `pattern` = the pitch structure
  (free_audit | performance_guarantee | done_for_you | free_pilot | case_study_teardown |
  unique_mechanism_pitch | partnership | risk_reversal). `proof_hint` names the case
  study that backs the offer — cross-reference it with a `case_studies` search.

## 5b. `POST /api/prospects/lookup` — prospect touch-history (for outreach research)
**Use this for "what stage is this prospect at / have we touched them / who did we reach"
— NOT semantic search.** It is a deterministic company-name lookup, instant.
Body: `{ "client": "scaletopia", "companies": ["Amsive", "First Media", ...] }`
(pass the whole prospect list at once; `client` defaults to `scaletopia`).
Returns `{ client, count, matched, fresh, prospects: [...] }`. Each prospect:
- `matched` (false = fresh, never contacted), `touches`, `first_touch`, `last_touch`
- `furthest_stage` (how far down the funnel they got)
- `had_call` + `call.title` (whether we had a discovery/sales call, from the transcripts)
- `contacts_reached`: `[{name, title, seniority}]` — who we already hit
- `outcomes` (reply categories / lost reasons), `campaigns`
- **`suggested_next`**: who to contact next (e.g. "already reached director-level, go higher
  to co-founder / SVP biz dev"), based on the seniority already contacted.
Note: only as complete as ingested data — a call Aaman had that was never ingested won't show.

## 5c. `POST /api/clients/{slug}/reply-diagnosis` — why a campaign isn't working
Reads the actual inbound replies and buckets the REASON behind each: opt-out, wrong
contact, wrong fit, already-has-a-solution, price, timing, "how'd you get my number",
not interested, hostile, positive. Body: `{ "campaign"?: "name substring", "weeks"?: 8 }`
(both optional; omit for all-time / all campaigns).
Returns `{ total_replies_analyzed, by_lead_category, negative_share_pct, reasons: [{reason,
count, pct, examples:[{company, quote}]}] }`. Use to diagnose a failing campaign fast:
a high opt-out + wrong-contact + "how'd you get my #" share = list-quality / spam problem,
not copy. Fast keyword classification, so an "Other / unclear" bucket remains — for the
qualitative read, pull the actual negative threads with
`GET /api/clients/{slug}/contacts?category=Not%20Interested` (or another category) and read them.

## 6. `POST /api/clusters` — dominant pains across a whole niche (or one client)
Body: `{ "niche": "DTC ecom" }` OR `{ "client": "kynship" }`, optional `"threshold": 0.82` (cosine cutoff for grouping).
Response:
```json
{ "scope", "threshold", "total_pains", "clusters_total", "multi_member_clusters",
  "singletons", "shown",
  "clusters": [{ "representative": "the pain text", "size": 56, "client_count": 2,
                 "clients": ["chamber_media","kynship"], "kinds": ["pain","objection"],
                 "members": [{"id","text","kind","client","confidence"}] }] }
```
Sorted by `size`. `client_count > 1` = validated across clients (safest lead angle for a new client in the niche).

## 7. `GET /api/niches` — the canonical niche tree
No params. `[{ "id":1, "name":"DTC ecom", "subs":[{"id":3,"name":"Supplements"}, ...] }]`
Use the ids as `nicheId`/`subNicheId` in search for exact (non-fuzzy) scoping.

## 8. `GET /api/graph` — the whole knowledge graph
No params. `{ "nodes": [{id, type, label, value?, parent?, niche?, meta?}], "edges": [{source, target, kind}], "summary": {clients, niches, sharedNiches} }`
Node types: niche, kb (niche brain), kbpain, kblingo, client, hub, painkind, pain, angle, campaign, case, copy, call.
Edge kinds: `in-niche`, `has`, `mined-from` (pain → its source call), `for-campaign` (copy → campaign), `co-client` (clients sharing a niche), `related <sim>` (niche ↔ niche by embedding).
Use for: tracing provenance and seeing how everything connects. Heavy; prefer targeted endpoints for data pulls.

## 9. `GET /api/openapi` — machine-readable OpenAPI 3.1 spec of the API.

---

# WRITE / ACTION ENDPOINTS

## 10. `POST /api/agents/save-copy` — save a finished copy
```json
{ "client_slug": "kynship",
  "t1": "first message", "t2": "follow-up",
  "lever": "Unique", "persona": "VP Marketing", "niche": "DTC ecom",
  "status": "draft",
  "variant": "B",
  "campaignId": 41,
  "components": [
    {"component_type":"disarmer","item_text":"..."} ] }
```
- Required: `client_slug` + at least one of `t1`/`t2`.
- `status`: draft | winner | loser | neutral — save as `draft`.
- `campaignId`: optional, links at save time (DB id from #2/#4).
- `components[].component_type`: disarmer | identity | case_line | unique_mechanism | relevance | cta.
Returns `{ok, output}` (output includes the new copy id). Char counts + embeddings computed server-side.

## 10b. Guidelines — persistent strategist memory (3 lanes: copy · gtm_memory · audit)
- `GET /api/guidelines?client={slug}` -> `{count, guidelines:[{id, client_slug, kind,
  guideline_text, context, source, created_at}]}` — the client's + global, newest first.
  **Fetch this before every copy task.** Add `&kind=gtm_memory,audit` to load only the
  GTM lanes (before prospecting / GTM work), or `&kind=preference,process,rule,learning`
  for just the copy rules. `kind` is comma-separated and case-insensitive.
- Lanes by `kind`: **copy** = `preference|process|rule|learning` (read before writing);
  **`gtm_memory`** = durable per-client GTM facts/decisions; **`audit`** = a campaign
  problem + what to test next (campaign in `context`; open while active, `PATCH active:false`
  to resolve).
- `POST /api/guidelines` — save one `{client_slug?, kind?, guideline_text, context?, source?}`
  or `{items:[...]}`. `client_slug` null/absent = global. Duplicates auto-skipped.
- `PATCH /api/guidelines` `{id, active:false}` — retire an outdated guideline / resolve an audit item.
- `POST /api/search {"type":"guidelines","query":"..."}` — semantic search
  (returns `id, client_slug, kind, guideline_text, context, source, created_at, score`).

## 11. `POST /api/copy/link` — link/unlink a copy to a campaign
`{ "copyId": 12, "campaignId": 41 }` (or `"campaignId": null` to unlink). Returns `{ok}`.
The copy inherits the campaign's niche/persona where empty.

## 12. `PATCH /api/clients/{slug}/niche` — human override of a client's niche
`{ "nicheId": 1, "subNicheId": 3 }` (ids from `/api/niches`; subNicheId optional).
Sets `niche_source='human'` (human always wins over AI tagging) and inherits to the client's pains + case studies. Returns `{ok, niche, source}`.

## 13–17. Ingestion agents (feed new data in; each returns `{ok, output}`; may take ~1 min)
- `POST /api/agents/onboarding` — `{client, slug, form (the pasted onboarding text), airtableId?, niche?, subNiche?}` → creates the client + extracts pains. **Run this first for a new client.**
- `POST /api/agents/transcript` — `{client, sourceCallId (unique id, e.g. "kynship_call22"), text (the transcript), title?, provider?, mine?: true}` → saves + chunks the call, mines pains. Re-running the same `sourceCallId` is skipped (no duplicates).
- `POST /api/agents/case-study` — `{client, text (pasted case studies), sourceLabel? (stable dedup prefix, e.g. "Kynship Master Sheet · Tab 4")}` → splits, tiers S–D, saves.
- `POST /api/agents/campaign-sync` — `{client, airtableId?, dryRun?: true}` → pulls the client's campaigns from Airtable into the DB.
- `POST /api/agents/niche-synth` — `{niche}` → rebuilds the niche brain (summary, top pains, lingo, levers) from all clients in that niche.

---

# Quality signals (how to read what comes back)

- `confidence` (pains): `confirmed` verified > `needs_more` AI guess.
- `tier` (case studies): S strongest → D weakest; prefer S/A/B.
- `weight` (pains/case_studies/copies): the composite rank; higher = more trustworthy. For
  copies: relevance × performance × recency, where performance is results **per send**,
  sample-adjusted, scored bookings (0.5) > power requests (0.3) > raw positives (0.2) —
  10 meetings on 5,000 sends scores below 5 on 200. Known losers sink; **past clients'
  copies are downweighted ×0.6** (reference, not gospel).
- `aged: true` (copies): old; the lesson may hold, the phrasing/offer may not.
- `why_it_worked` / `why_it_failed` (copies): stored analysis of each winner/loser. Losers
  work as anti-pattern checks.
- `client_count` (clusters): >1 = pain validated across multiple clients.
- `score`: cosine similarity 0–1 (>0.75 strong, <0.6 weak).
- `source` (pains) / `mined-from` edges (graph): provenance back to the exact call.

What you do with these signals is your playbook's business.

# Practical patterns

- **Brief on a client**: #2 + #3 + #4c (replies) in parallel → then targeted #5 searches per angle.
- **New client in a known niche**: #6 clusters (lead with `client_count > 1`) + #7 for exact ids + the niche brain from #2.
- **Evidence for one angle**: #5 with `route:true`, `limit` 3–6 per type; go deeper only if thin.
- **Pre-empt objections**: #4c replies (`no_examples` + `lost_reasons`) → your copy should
  answer this week's actual "no"s before they're raised.
- **Study what converts WHO**: #4b deals filtered by stage/variant → which variant books
  which job titles; then #5 `{type:"deals"}` to read the winning threads themselves.
- **Pick the campaign to write for**: client detail campaigns sorted by `power_rate` —
  write for what's already resonating, or fix what isn't.
- **After writing**: #10 save as draft **with `variant`** → #11 link to campaign (ids from #4).

# Data integrity rules

- Never invent metrics, results, or proof; only cite what the API returned.
- Only write through the endpoints above; never assume DB access.
- Save copy as `draft`; winner/loser comes from real metrics later, not from the writer.


## Drafts — research scratchpad per client
`GET/POST/DELETE /api/drafts` and `POST /api/search {"type":"drafts"}` — your working
research/ICP/angle/draft notes per client, including clients not yet onboarded.
