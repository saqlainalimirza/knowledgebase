# Database Guide (for developers)

The database is **Supabase (Postgres)** with the **pgvector** extension (for AI
embeddings / semantic search). This doc explains every table in plain English: what it
holds, how it gets filled, and how tables connect.

There are **two systems** living in one database:
1. **Copy Intelligence** — calls, pains, case studies, copy, niches. (What most of the app is about.)
2. **Leads & Data** — companies, people, imports, Clay pushes. (A separate lead-list system.)

Two ideas you'll see everywhere:
- **`client_slug`** — a short id for a client (e.g. `chamber_media`). Almost everything links to a client by this.
- **`embedding`** — a list of 1536 numbers that represents the *meaning* of some text. Used for "find similar" / semantic search. Type shows as `USER-DEFINED` (that's `vector`).

---

## PART 1 — Copy Intelligence tables

### `niches` — the canonical list of industries (25 rows)
The official, clean list of niches and sub-niches. Two levels: a parent niche (e.g. **DTC ecom**) and its children (e.g. **Supplements**, **Fashion & Apparel**).
- `name` — the niche name. `parent_id` — points to its parent (null = it's a top-level niche). `embedding` — meaning of the name, used to auto-match messy text to the right niche.
- **Why it exists:** so everything groups by a stable id instead of free text ("DTC ecom" vs "D2C" no longer split).

### `client_roster` — the list of clients (7 rows)
One row per client. The anchor everything hangs off.
- `slug` (the key), `client` (display name), `airtable_client_id` (links to Airtable), `offer`, `status`, `retainer` info.
- `niche` (text) + **`niche_id` / `sub_niche_id`** (link to the `niches` table) + **`niche_source`** (`ai` if auto-tagged, `human` if a person set it — human wins).
- `signature_case_study_ids` — a client's best proof.

### `client_aliases` — nicknames for a client (0 rows)
Maps "Big Leap" / "bigleap" / "BL" → the same `client_slug`. So a slightly different name still finds the right client.

### `client_calls` — full call transcripts (72 rows)
One row per sales call / doc. Holds the **whole raw transcript**.
- `source_call_id` (unique — stops duplicates), `title`, `call_date`, `raw_transcript`, `participants`.

### `call_chunks` — transcripts cut into small pieces (1,282 rows)
Each call is split into ~400-word chunks so we can search "who said what."
- `chunk_text` (the words), `embedding` (its meaning), `client_slug`, `niche`. Links to a call via `call_id`.

### `master_sheet_pains` — voice of the customer (1,217 rows)
The most important knowledge table. Every pain, phrase (lingo), dream, belief, or objection buyers said.
- `kind` — one of: pain / lingo / dream / belief / objection.
- `item_text` — the actual quote. `confidence` — `confirmed` (verified) or `needs_more` (a guess that upgrades later).
- `persona` — who said it. `embedding` — its meaning. `source` — where it came from (e.g. "call chamber_media_call6").
- **New tagging columns:** `niche_id`, `sub_niche_id`, `job_function` (marketing/sales/exec…), `seniority` (c_level/vp/…), `niche_source`.

### `case_studies` — proof / results stories (182 rows)
"Brand X grew 3x in 7 months." What we quote in copy.
- `subject_brand`, `before_state`, `after_state`, `unique_mechanism`, `tier` (S = best → D = weak), `timeframe`.
- `source_ref` — unique key so re-loading updates instead of duplicating.
- Three embeddings: `result_embedding`, `unique_mechanism_embedding`, `niche_embedding`. Plus `niche_id` / `sub_niche_id`.

### `niche_knowledge` — the "niche brain" (3 rows, one per niche)
One pooled summary per niche, built from ALL clients in that niche.
- `commonalities_summary`, `top_pains`, `shared_lingo`, `dream_outcomes`, `winning_levers` (JSON), `summary_embedding`, `source_client_slugs`.
- **Filled by:** the niche-synthesis agent (clusters everyone's pains → writes a summary).

### `campaigns` — outreach campaigns (286 rows)
Mirrored **from Airtable** (we don't create these).
- `airtable_campaign_id`, `name`, `client_slug`, `channel` (sms/email), `angle`, `segment`.
- **New:** `niche_id`, `sub_niche_id` (parsed from the campaign name), `employee_range` (e.g. `3-200`).

### `copies` — finished copy (0 rows — added via the app)
The actual SMS/email messages we write.
- `t1`, `t2` (the message + follow-up), `char_t1`/`char_t2` (auto-counted), `lever`, `pattern`, `unique_mechanism`, `cta`, `status` (draft/winner/loser), `campaign_id`, `case_study_id`.
- Embeddings: `full_copy_embedding`, `t1_embedding`, `unique_mechanism_embedding`.

### `copy_components` — the 6 parts of each copy (0 rows)
Each copy broken into: disarmer / identity / case_line / unique_mechanism / relevance / cta. Each with a `verdict` and `embedding`. Lets us search "what hooks work" separately.

### `copy_metrics` — real results per copy (0 rows — comes later)
`sent`, `positive_responses`, `booked_calls` per copy/campaign/period. Feeds the win-rate. **Filled later** from Airtable Daily stats.

### `direction_sheets` — strategy notes (0 rows)
Optional "why we chose this angle" reasoning per campaign.

### Views (not real tables — live saved queries)
- **`winners`** — just copies where `status = winner`.
- **`losers`** — just copies where `status = loser`.
- **`copy_performance`** — copies joined to their metrics, with rates **calculated for you**: `positive_rate`, `sent_per_positive`, `sent_per_booked`. This is how we judge real winners.

---

## PART 2 — Leads & Data tables (separate subsystem)

This is the lead-list / enrichment side (Clay, EmailBison, GoHighLevel). Mostly independent from Copy Intelligence.

### `companies` — company lead database (109,765 rows)
Scraped/enriched companies. `company_name`, `domain`, `industry`, `employee_count`, `city/state/country`, `revenue`, `email`, `technologies`, `quality_tier`, `pushed_to_clay`, etc.

### `people` — contact lead database (14,187 rows)
People at those companies. `full_name`, `email`, `phone`, `job_title`, `linkedin_url`, `company_name`, `pushed_to_emailbison`, `pushed_to_ghl`. Links to `companies` via `company_id`.

### `clay_push_runs` (99 rows)
Log of pushes to Clay: `filters`, `status`, `total_matched`, `pushed_count`, errors.

### `import_history` (30 rows) & `import_provider_mappings` (13 rows)
Track data imports: which file/source, how many rows in/deduped/inserted, and saved column-mapping presets per provider.

---

## How the Copy-Intelligence tables connect

```
niches ─────┐ (canonical niche/sub-niche)
            │  niche_id / sub_niche_id on:
client_roster ──< client_calls ──< call_chunks 🔍
      │         ──< master_sheet_pains 🔍   (pains/lingo/dreams…)
      │         ──< case_studies 🔍          (proof, tiered)
      │         ──< copies ──< copy_components 🔍
campaigns (from Airtable) ──< copies ──< copy_metrics ──> copy_performance (view)
niche  ──> niche_knowledge 🔍   (pooled summary per niche)
```
🔍 = has an embedding (searchable by meaning).

**Golden rules for devs:**
- A client must exist in `client_roster` before its calls/pains/copy can attach.
- Group/filter by `niche_id` (stable), not the `niche` text.
- Never hand-write embeddings — one code path creates them (see BACKEND.md).
- `companies`/`people` are the leads system — don't confuse them with `client_roster` (our agency clients).
