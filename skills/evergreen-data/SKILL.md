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
Returns one object with 6 sections:
- `client`: `{slug, client, niche, sub_niche, offer, airtable_client_id, status}`
- `pains` (up to 500): `[{id, kind, persona, item_text, confidence, source}]`
  - `kind`: pain | lingo | dream | belief | objection. `confidence`: confirmed | needs_more.
  - `source`: provenance, e.g. `"call kynship_call8"` (which transcript it was mined from).
- `painKinds`: `[{kind, n}]` counts per kind.
- `caseStudies`: `[{id, subject_brand, tier, after_state, unique_mechanism, timeframe, source_ref}]`
- `calls`: `[{id, title, source, source_call_id, call_date, chunks}]` (`chunks` = number of searchable pieces)
- `campaigns` (up to 200): `[{id, name, channel, angle, segment, niche, notes}]`
  - `id` here is the DB campaign id used by `/api/copy/link` and `save-copy.campaignId`.
- `niche`: the niche brain — `{commonalities_summary, top_pains, shared_lingo, dream_outcomes, winning_levers, refreshed_at}` (JSON arrays; null if not built).

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

## 5. `POST /api/search` — semantic search over any knowledge type (the workhorse)
Body:
```json
{ "type": "pains" | "calls" | "case_studies" | "copies" | "components" | "offers",
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
- `copies`: `id, client_slug, status, lever, pattern, sophistication, t1, t2, unique_mechanism, pattern_interrupt, cta, why_it_worked, why_it_failed, created_at, score` plus (when metrics exist) `positive_rate, positives, sent, booked` plus computed `performance, recency, aged, weight` — sorted by `weight`. **`why_it_worked` / `why_it_failed` are the richest fields in the system; always read them.**
- `components`: `id, component_type (disarmer|identity|case_line|unique_mechanism|relevance|cta), item_text, verdict (winner|loser|neutral), persona, lever, score` — swipeable individual parts.
- `offers`: `id, client_slug, offer_text, service, pattern, mechanism, proof_hint, score` —
  what each client pitches. **`service`** is the cross-client key (seo | local_seo |
  paid_ads | creative | tiktok_shop | amazon | pr | email_sms_marketing | web_design |
  cro | returns_software | other): when an offer works for one client, search offers by
  the same `service` to find every other client selling the same thing (e.g. a local-SEO
  win for Leadgenix transfers to Digital Resource). `pattern` = the pitch structure
  (free_audit | performance_guarantee | done_for_you | free_pilot | case_study_teardown |
  unique_mechanism_pitch | partnership | risk_reversal). `proof_hint` names the case
  study that backs the offer — cross-reference it with a `case_studies` search.

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
  "campaignId": 41,
  "components": [
    {"component_type":"disarmer","item_text":"..."} ] }
```
- Required: `client_slug` + at least one of `t1`/`t2`.
- `status`: draft | winner | loser | neutral — save as `draft`.
- `campaignId`: optional, links at save time (DB id from #2/#4).
- `components[].component_type`: disarmer | identity | case_line | unique_mechanism | relevance | cta.
Returns `{ok, output}` (output includes the new copy id). Char counts + embeddings computed server-side.

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
  sample-adjusted (10 meetings on 5,000 sends scores below 5 on 200); known losers sink.
- `aged: true` (copies): old; the lesson may hold, the phrasing/offer may not.
- `why_it_worked` / `why_it_failed` (copies): stored analysis of each winner/loser. Losers
  work as anti-pattern checks.
- `client_count` (clusters): >1 = pain validated across multiple clients.
- `score`: cosine similarity 0–1 (>0.75 strong, <0.6 weak).
- `source` (pains) / `mined-from` edges (graph): provenance back to the exact call.

What you do with these signals is your playbook's business.

# Practical patterns

- **Brief on a client**: #2 + #3 in parallel → then targeted #5 searches per angle.
- **New client in a known niche**: #6 clusters (lead with `client_count > 1`) + #7 for exact ids + the niche brain from #2.
- **Evidence for one angle**: #5 with `route:true`, `limit` 3–6 per type; go deeper only if thin.
- **After writing**: #10 save as draft → #11 link to campaign (campaign ids from #4).

# Data integrity rules

- Never invent metrics, results, or proof; only cite what the API returned.
- Only write through the endpoints above; never assume DB access.
- Save copy as `draft`; winner/loser comes from real metrics later, not from the writer.
