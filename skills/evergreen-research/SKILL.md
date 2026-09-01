---
name: evergreen-research
description: "Evergreen is Scaletopia's research and knowledge PROVIDER, not a copywriter. It gathers, stores and serves researched findings so a copywriter can write FROM real evidence: proven pains and buyer lingo, winning/losing copy with why-it-worked, tiered proof/case studies, the client's own voice/positioning/materials, saved guidelines, objection threads, offers, and the knowledge graph. Use it to PULL evidence for a brief and to SAVE new findings/materials/rules back. It does NOT write the copy — the actual copywriting is a SEPARATE skill (the copywriter's own playbook) that consumes what Evergreen returns. For NUMBERS/stats use the evergreen-stats skill. Triggers on 'brief me on {client}', 'pull pains/proof/winners/objections/materials for {client}', 'what works for {niche}', 'save this finding/material/guideline into Evergreen'."
---

# Evergreen Research & Knowledge (the info provider)

**Evergreen is the research layer, not the writer.** Its job is to gather, store, and serve
findings. The copywriting is done by a **separate copywriter skill** (the writer's own
playbook) that pulls this evidence and writes from it. This skill's job is only:
**(1) pull the right findings, (2) save new findings back.** Do not treat Evergreen as the
author of the copy, and do not answer NUMBERS here (use **evergreen-stats**).

How they fit together: `evergreen-research` (evidence in/out) + `evergreen-stats` (numbers)
feed the **copywriter skill** (writes). Three separate jobs.

**Base URL (live):** `https://knowledgebase-production-f52e.up.railway.app`
All bodies JSON. Independent calls can run in parallel. Use Evergreen first; only fall back to
GHL/Airtable/Smartlead MCP for something Evergreen genuinely lacks, and never bulk-pull.

---

# WHEN THE COPYWRITER NEEDS A BRIEF (the evidence pull)

For the target client, fetch these FOUR in parallel and hand the findings to the writer.
This is the evidence to write FROM, not a stale local file. Evergreen returns the facts; the
copywriter skill turns them into copy.

1. **Winners** — `POST /api/search {"type":"copies","query":"<angle>","status":"winner"}`; read `why_it_worked`.
2. **This week's objections** — `GET /api/clients/{slug}/replies` (`no_examples` + `by_category_recent`). What people actually reply.
3. **The client's voice/identity** — `GET /api/clients/{slug}` `materials`, or `POST /api/search {"type":"materials"}` (positioning/voice/pricing).
4. **Saved guidelines** — `GET /api/guidelines?client={slug}` (standing rules/preferences; newer wins).

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
- `slack` — client channel messages. `guidelines` — saved rules. `materials` — client docs. `drafts` — research scratchpad.

Quality signals: `weight` (composite rank, higher = better), `confidence` (confirmed>needs_more),
`tier` (S best), `score` (cosine; >0.75 strong), `aged:true` (old phrasing), past-client copies ×0.6.

# Orientation & niche
- `GET /api/clients/{slug}` — client detail: `pains, caseStudies, calls, campaigns, niche` brain, `guidelines`, `materials`.
- `POST /api/clusters {"niche":"DTC ecom"}` — dominant pains across a niche (`client_count>1` = validated). `GET /api/niches` — canonical tree (ids for exact scoping).

---

# SAVE NEW FINDINGS BACK (how knowledge gets into Evergreen)

This is how a strategist "puts something into Evergreen." Say it in plain English, then save:

- **Findings / rules / preferences** — `GET /api/guidelines?client={slug}` to read;
  `POST /api/guidelines {client_slug|null, kind:"preference|process|rule|learning|gtm_memory|audit",
  guideline_text, context}` when someone says "save this into Evergreen"; `PATCH {id, active:false}` to retire.
  (client_slug null = an agency-wide finding.)
- **Client materials** — `GET /api/materials?client={slug}`; `POST /api/materials {client_slug, title,
  material_type:"proposal|positioning|voice|audit|web_scrape|brochure|pricing|other", context, content}`.
- **Copy that ran/worked, as a RECORD of the finding** — `POST /api/agents/save-copy`
  `{client_slug, t1, t2, lever, persona, niche, status:"draft", variant, campaignId | campaignName,
  components:[...]}`. This STORES copy so its result feeds future briefs; it is not Evergreen writing
  copy. Save as `draft` (winner/loser is decided later by real metrics, never by the writer);
  `campaignName` resolves so it inherits real stats.
- **Drafts** (research scratchpad, incl. not-yet-onboarded clients) — `GET/POST/DELETE /api/drafts`.
- `POST /api/copy/link {copyId, campaignId}` — link a stored copy to a campaign.
- Ingestion: `POST /api/agents/{onboarding|transcript|case-study|campaign-sync|niche-synth}`.

# Patterns
- **Brief on a client**: client detail + replies (objections) in parallel → targeted searches per angle → read materials for voice. Hand the findings to the copywriter skill.
- **New client in a known niche**: clusters (`client_count>1`) + the niche brain + winners in that niche.

# Rules
- Evergreen provides evidence; it does not decide or author the copy. Never invent metrics/proof; cite only what the API returned.
- Only read/write through these endpoints. Store copy as `draft`; real metrics decide winner/loser.
