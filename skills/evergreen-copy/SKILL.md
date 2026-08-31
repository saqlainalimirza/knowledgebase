---
name: evergreen-copy
description: "Evidence supply for WRITING outbound copy and doing client/prospect research from Scaletopia's Evergreen API: real pains and buyer lingo, winning/losing copy with why-it-worked, tiered proof/case studies, the client's own voice/materials, saved guidelines, objection threads, offers, and the knowledge graph. Fetch evidence, then write with YOUR playbook, then save the copy back. This skill does NOT report numbers/stats — for 'how many PRs / how is X doing / which variant won', use the evergreen-stats skill. Triggers on 'write an SMS/email for {client}', 'brief me on {client}', 'what works for {niche}', 'pull pains/proof/winners/objections', 'save this copy/guideline'."
---

# Evergreen Copy & Research

Your copywriting method is YOUR playbook. This skill supplies the evidence to write from and
saves results back. For any NUMBERS question (PRs, sent, booked, which variant won, reports),
stop and use the **evergreen-stats** skill — do not answer stats from here.

**Base URL (live):** `https://knowledgebase-production-f52e.up.railway.app`
All bodies JSON. Independent calls can run in parallel.

Use Evergreen first; only fall back to GHL/Airtable/Smartlead MCP for something Evergreen
genuinely lacks, and never bulk-pull from them.

---

# BEFORE YOU WRITE ANY COPY (every time, no exceptions)

For the target client, fetch these FOUR in parallel and write from them, not from a stale
local file:

1. **Winners** — `POST /api/search {"type":"copies","query":"<angle>","status":"winner"}`; read `why_it_worked`.
2. **This week's objections** — `GET /api/clients/{slug}/replies` (`no_examples` + `by_category_recent`). Pre-empt what people actually reply.
3. **The client's voice/identity** — `GET /api/clients/{slug}` `materials`, or `POST /api/search {"type":"materials"}` (positioning/voice/pricing).
4. **Saved guidelines** — `GET /api/guidelines?client={slug}` (standing rules/preferences; newer wins).

After writing, SAVE it (save-copy) so the loop compounds.

---

# `POST /api/search` — the research workhorse (meaning-search only, never for counts)

Body: `{ "type": <below>, "query": "...", "limit": 10, "route": true, "niche": "...",
"nicheId": 1, "subNicheId": 3, "status": "winner" }`. `route:true` auto-scopes to the best niche.

Types + key fields:
- `copies` — `status, variant, lever, pattern, t1, t2, unique_mechanism, cta, why_it_worked,
  why_it_failed` (+ perf when linked). **Read why_it_worked/why_it_failed.** `status` filter: winner|loser.
- `pains` — `kind (pain|lingo|dream|belief|objection), persona, item_text, confidence`.
- `case_studies` — `subject_brand, tier (S..D), after_state, unique_mechanism`. Prefer S/A/B.
- `components` — swipeable parts: `component_type (disarmer|identity|case_line|unique_mechanism|relevance|cta), verdict`.
- `offers` — `offer_text, service (cross-client key), pattern, mechanism, proof_hint`.
- `deals` — semantic search over real reply THREADS (`conversation`); study how winning convos go.
- `contacts` — categorized reply threads (positives are indexed; for negatives use
  `GET /api/clients/{slug}/contacts?category=Not%20Interested` and read them).
- `slack` — client channel messages. `guidelines` — saved rules. `materials` — client docs. `drafts` — your research scratchpad.

Quality signals: `weight` (composite rank, higher = better), `confidence` (confirmed>needs_more),
`tier` (S best), `score` (cosine; >0.75 strong), `aged:true` (old phrasing), past-client copies ×0.6.

# Orientation & niche
- `GET /api/clients/{slug}` — client detail: `pains, caseStudies, calls, campaigns, niche` brain, `guidelines`, `materials`.
- `POST /api/clusters {"niche":"DTC ecom"}` — dominant pains across a niche (`client_count>1` = validated). `GET /api/niches` — canonical tree (ids for exact scoping).

---

# SAVE / ACTION

- `POST /api/agents/save-copy` — `{client_slug, t1, t2, lever, persona, niche, status:"draft",
  variant, campaignId | campaignName, components:[...]}`. Save as `draft`; pass `variant`;
  `campaignName` resolves to the campaign so it inherits real stats. **Do this after writing.**
- **Guidelines** (persistent memory) — `GET /api/guidelines?client={slug}` (fetch before writing);
  `POST /api/guidelines {client_slug|null, kind:"preference|process|rule|learning|gtm_memory|audit",
  guideline_text, context}` when the strategist says "save this into Evergreen"; `PATCH {id, active:false}` to retire.
- **Materials** — `GET /api/materials?client={slug}`; `POST /api/materials {client_slug, title,
  material_type:"proposal|positioning|voice|audit|web_scrape|brochure|pricing|other", context, content}`.
- **Drafts** (research scratchpad, incl. not-yet-onboarded clients) — `GET/POST/DELETE /api/drafts`.
- `POST /api/copy/link {copyId, campaignId}` — link copy to a campaign.
- Ingestion: `POST /api/agents/{onboarding|transcript|case-study|campaign-sync|niche-synth}`.

# Patterns
- **Brief on a client**: client detail + replies (objections) in parallel → targeted searches per angle → read materials for voice.
- **New client in a known niche**: clusters (`client_count>1`) + the niche brain + winners in that niche.
- **After writing**: save-copy as draft WITH variant + campaignName.

# Rules
- Never invent metrics/proof; cite only what the API returned. Only write through these endpoints.
- Save copy as `draft`; winner/loser is decided later by real metrics, not the writer.
