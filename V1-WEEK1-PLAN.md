# V1 — Week 1 Detailed Plan (Foundation)

**Clean-slate build.** V1 is a fresh codebase + fresh schema + fresh Supabase — not an
upgrade of the MVP. We keep the MVP's *proven logic* (chunker, dedup keys, extraction
prompts, niche routing/clustering, Airtable field mappings) and re-implement it cleanly;
we throw away the MVP's flat schema and patched code. The MVP was the throwaway prototype
that de-risked the real build.

Week 1 turns the locked Week-0 design into a running foundation: the V1 schema live, one
hardened ingestion pipeline writing into it, all clients **re-ingested fresh from raw
sources** (not migrated), and the API/front-end reading V1. Companion to
[V1-BUILD-PLAN.md](V1-BUILD-PLAN.md).

---

## 0. Entry criteria (from Week 0)

- Locked schema decisions (§12 questions resolved).
- A **separate V1 Supabase project** (staging) — the live MVP keeps running untouched.
- Aaman's Drive inputs landing (transcripts, copies+campaigns, drafts).

---

## 1. Week-1 objectives (Definition of Done)

By Friday, all true if:
1. V1 schema live with the **inference-first tagging model** (inferred niche/title text +
   embeddings on the rows; small controlled buckets for function/seniority/size).
2. **Ingestion pipeline v2** ingests any input → normalize → chunk → embed → dedup →
   write → **AI-infer tags on write** → emit edges, idempotently, from a folder drop.
3. **All clients re-ingested fresh** into V1 from raw source files (not migrated).
4. **Vector indexes** (ivfflat/hnsw) on every embedding column.
5. **API skeleton** reads V1 (clients list/detail, search with scope) + regenerated OpenAPI.
6. **QA harness** passes: 0 missing embeddings, counts sane, buckets populated.

---

## 2. Guiding principles (the "why" behind the design)

- **Inference-first, not hand-tagging.** The AI infers niche / job title / etc. from raw
  text **at ingest** — no human tagging, no giant canonical taxonomy to maintain. We just
  **store the inferred result once** (as text + embedding) so we don't re-infer on every
  read. (Details §4.)
- **Embeddings for fuzzy, small buckets for exact.** Approximate grouping/routing ("pains
  like X", "titles like CMO", route to niche) = embeddings, no tables needed. Only the few
  dimensions that must be **counted exactly** (job function, seniority, employee-range) get
  a tiny controlled bucket — because reproducible analytics need a stable key, not a fresh
  LLM guess each query.
- **Structural joins are already exact IDs.** client ↔ campaign ↔ deal ↔ copy ↔ variant ↔
  title all exist as IDs in the Airtable **Deals table** — zero inference; we sync them
  (later — see next point).
- **Build in funnel order.** The value chain is: **knowledge (pains/proof) → copy →
  campaign → deal**. So the build follows it: Week 1 = knowledge foundation + re-ingest;
  Week 2 = copy + campaign metrics; **Week 3 = deals/attribution (the end of the funnel)**.
  We do NOT sync deals in Week 1 — a deal doesn't exist until copy has run in a campaign.
- **Clean slate, port proven logic.** Fresh code/schema; reuse the MVP's chunker, dedup,
  prompts, routing.
- **Rebuild from raw sources**, not the MVP DB (§6). **Staging isolation** — MVP stays live
  until cutover. **Idempotent everything.**

---

## 3. The Week-1 schema (lighter, inference-first)

No `niches`/`job_titles` canonical tables, no polymorphic `entity_tags`. Instead, every
knowledge row carries the **inferred value + its embedding** inline, plus the **small
bucket** fields. Structural links are FK IDs synced from Airtable.

```sql
-- small controlled buckets (AI-assigned at ingest; the ONLY exact-groupable dims)
-- kept as text-with-check, not big tables:
--   job_function : 'marketing'|'sales'|'exec'|'ops'|'finance'|'founder'|'other'
--   seniority    : 'c_level'|'vp'|'director'|'manager'|'founder'|'owner'|'ic'|'other'
--   employee_range: text band from the campaign segment, e.g. '3-200'

create table clients (
  id bigserial primary key, slug text unique not null, name text not null,
  airtable_client_id text, offer text,
  niche text, sub_niche text, niche_embedding vector(1536),   -- inferred, fuzzy-groupable
  status text, retainer numeric, account_manager text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table contacts (                  -- synced from Airtable Deals (Contact Record ID)
  id bigserial primary key, client_id bigint references clients(id),
  airtable_contact_id text, name text, company text, email text,
  raw_title text, title_embedding vector(1536),               -- inferred/real title, fuzzy
  job_function text, seniority text,                          -- buckets, exact
  employee_range text
);

create table calls (
  id bigserial primary key, client_id bigint references clients(id),
  source_call_id text unique, title text, call_date date, source text, raw_transcript text
);
create table call_chunks (
  id bigserial primary key, call_id bigint references calls(id),
  client_id bigint references clients(id), chunk_index int, text text, embedding vector(1536)
);

create table pains (
  id bigserial primary key, client_id bigint references clients(id),
  kind text check (kind in ('pain','lingo','dream','belief','objection')),
  text text not null, confidence text, source_ref text,
  raw_title text, job_function text, seniority text,          -- who said it (inferred, bucketed)
  niche text,                                                 -- inherited/inferred
  embedding vector(1536)
);

create table case_studies (
  id bigserial primary key, owner_client_id bigint references clients(id),
  subject_brand text, tier text, before_state text, after_state text,
  notable_results text, timeframe text, mechanism text, unique_mechanism text,
  niche text, source_ref text unique,
  result_embedding vector(1536), mechanism_embedding vector(1536), niche_embedding vector(1536)
);

create table client_drafts (             -- analyst research for clients with no calls
  id bigserial primary key, client_id bigint references clients(id),
  author text, title text, body text, source text, niche text, embedding vector(1536)
);

-- ---------- copy & results ----------
create table campaigns (
  id bigserial primary key, airtable_campaign_id text unique, client_id bigint references clients(id),
  name text, niche text, segment text, angle text, channel text, variant text,
  employee_range text, start_date date
);
create table copies (
  id bigserial primary key, client_id bigint references clients(id),
  campaign_id bigint references campaigns(id), variant text, channel text,
  t1 text, t2 text, char_t1 int, char_t2 int, lever text, pattern text,
  unique_mechanism text, cta text, status text,
  full_embedding vector(1536), t1_embedding vector(1536)
);
create table copy_components (
  id bigserial primary key, copy_id bigint references copies(id),
  component_type text, text text, verdict text, embedding vector(1536)
);
create table copy_metrics (              -- from Airtable Daily SMS/Email + Relinked Campaigns
  id bigserial primary key, copy_id bigint references copies(id),
  campaign_id bigint references campaigns(id), variant text,
  period_start date, period_end date, sent int, positive_replies int, booked int, region text
);
create table deals (                     -- synced from Airtable Deals table (rich source)
  id bigserial primary key, airtable_deal_id text unique,
  campaign_id bigint references campaigns(id), copy_id bigint references copies(id), variant text,
  contact_id bigint references contacts(id),
  company text, stage text, value numeric, channel text,     -- Pipeline stage, closed-amount, Source
  job_function text, seniority text, employee_range text,    -- buckets from Title (from Contacts)
  positive_reply_category text, lost_reason text,            -- "why they said no"
  conversation text, created_at timestamptz
);
create table edges (
  id bigserial primary key, src_type text, src_id bigint, dst_type text, dst_id bigint, kind text,
  unique (src_type, src_id, dst_type, dst_id, kind)
);

-- ---------- indexes (do NOT skip — retrieval perf depends on this) ----------
create index on call_chunks  using ivfflat (embedding vector_cosine_ops);
create index on pains        using ivfflat (embedding vector_cosine_ops);
create index on case_studies using ivfflat (result_embedding vector_cosine_ops);
create index on copies       using ivfflat (full_embedding vector_cosine_ops);
-- btree on the exact buckets + FKs used in analytics:
create index on deals (job_function, seniority, employee_range);
create index on pains (job_function); create index on contacts (job_function, seniority);
```

**Why this is lighter and still correct:** fuzzy questions ("what do CMO-ish people say
in DTC-ish niches") run on the embeddings; exact questions ("won deals by function this
month") run on the buckets + Airtable-synced IDs. No canonical-table maintenance, no
`entity_tags` bookkeeping.

---

## 4. Tagging = AI inference at ingest (no hand work, no big taxonomy)

The whole "tagging" step is: **the LLM infers, we store once.**

1. **At ingest**, the extraction LLM already reads the transcript/form — in the same pass
   it returns `niche`, `sub_niche`, `raw_title`, and the **buckets** (`job_function`,
   `seniority`). No separate tagging job, no human.
2. **Store the inferred text + an embedding** on the row. Fuzzy grouping/routing later is
   pure embedding math — no canonical niche/title tables to keep in sync.
3. **Buckets are a tiny fixed vocab** (function/seniority/size) the LLM maps into, so the
   handful of exact reports (deals by role, variant win-rate by seniority) are countable
   and reproducible. The LLM assigns them; we don't hand-tag.
4. **Where the value already exists, don't infer — sync.** The Airtable Deals table gives
   real `Title (from Contacts)`, `Copy Variant`, company, stage — we take those as-is.
5. **Employee-range** comes free from the campaign segment band (`3-200E` → `3-200`); no
   inference needed.

> This is the answer to "why do any hard work": we don't. AI infers, we persist the
> result so it's *consistent and countable*. The only thing we'd lose by inferring on
> every read is reproducible analytics (same question → same number) — which is exactly
> what a reporting/attribution product cannot lose.

---

## 5. Ingestion pipeline v2 (we already have this — it's a port, not a build)

**The ingestion code exists.** The MVP agents (`onboarding_agent`, `transcript_agent`,
`case_study_agent`, `campaign_sync_agent`, embed path, chunker, dedup) **ingested all 7
clients today**. "v2" = port those working agents into the clean V1 service and add two
things: **inference-on-write** (§4) and **transcript splitting**. Re-ingest is just
running the ported agents on the raw folders — proven, same-day fast.

One service, one write path, hardened over the MVP agents:

- **Inputs:** transcript, case-study text/CSV, onboarding form, analyst draft, Airtable
  sync. **Folder-drop**: point it at a per-client folder, it ingests everything.
- **Transcript splitting (missed in MVP).** Split multi-call files on call boundaries
  (URL headers / speaker resets / "Call N") so each call is its own record with correct
  provenance.
- **Data contracts.** A JSON schema per input type is the seam between LLM extraction and
  the dedup-safe writer. The contract now includes the inferred `niche`/`raw_title`/
  buckets — filled in the same LLM pass, validated, inserted. Nothing hand-writes SQL.
- **Inference on write.** Niche/title/function/seniority inferred + embedded as the row is
  created (§4). Edges (pain→call, copy→campaign) emitted too.
- **Idempotent + logged.** Dedup keys enforced; each run logs inserted/updated/skipped.

---

## 6. Fresh re-ingest into V1 (NOT a migration)

Rebuild V1 by running the V2 pipeline on the **raw source files on disk**, not by copying
the MVP database. No migration code; data lands correct and inferred on write; better
extraction than the MVP's first pass. The MVP DB is derivable from these sources.

**Raw sources (all present):** `chambermedia/` (transcripts + `gdocs/*.txt`),
`agents/clients/<slug>/` (Kynship + the 5 new clients), campaigns from Airtable, niche
brains regenerated by niche-synth.

Steps: (1) point pipeline v2 at each client folder → creates client + inferred/tagged
pains/cases/chunks + edges, embedding on write → (2) sync **campaigns** from Airtable
(reference data, needed later to link copy) → (3) niche-synth per niche → (4) QA harness.
**Deals are NOT synced this week** — a deal only exists after copy runs in a campaign, so
attribution is downstream (Week 3). *(We did the equivalent ingest for all 7 clients in
~30 min today with the existing agents, so this fits Week 1.)*

**QA harness (a deliverable):**
- per-client counts sane vs. raw inputs (calls, pains, cases, campaigns).
- `count(*) where embedding is null` == 0 across all vector columns.
- every pain/contact/deal has non-null buckets where applicable.
- spot-check: routed search for "rising CAC" returns DTC cross-client hits; "won deals by
  function" returns a stable count on re-run.

---

## 7. Embeddings & indexing (lock Week 1)

- **Model/dims:** Gemini `gemini-embedding-001` @ 1536 (matches MVP; no re-embed later).
  One path; never embed inside a skill.
- **Batch worker:** one re-embed job filling any NULL vector (reused for re-ingest + ongoing).
- **Indexes:** ivfflat on every vector column before bulk load; btree on the bucket
  columns used in analytics. Critical at 900+ pains in a niche already.

---

## 8. API skeleton (Lane 3, in parallel)

- Typed API reading V1: `GET /clients`, `/clients/{id}`, `POST /search` with
  `scope:{niche?, job_function?, seniority?, employee_range?}` — fuzzy scope (niche) via
  embedding, exact scope (buckets) via filter.
- Regenerate **`/api/openapi`** for the new scope params.
- Front-end points at V1 staging; no user-facing change until cutover.

---

## 9. Day-by-day

| Day | Lead (Hilal) | Engineer A (data/backend) | Engineer B (full-stack) |
|---|---|---|---|
| **Mon** | Kickoff w/ Jordan; lock schema + bucket vocab | Create V1 project; run schema DDL + indexes | Scaffold API + point front-end at V1 staging |
| **Tue** | Extraction contract incl. inferred fields + buckets | Ingestion v2: contracts + writers + inference-on-write | `GET /clients` + detail reading V1 |
| **Wed** | Re-ingest config + niche-synth | Re-ingest all clients from raw folders | `POST /search` w/ scope params; OpenAPI regen |
| **Thu** | Transcript-splitting rules; QA harness spec | Sync campaigns from Airtable (reference only) | Client detail full-context page on V1 |
| **Fri** | Run QA harness; sign-off review | Fix QA gaps; idempotency re-run test | Demo V1 read path; weekly review |

---

## 10. Deliverables (end of Week 1)

1. V1 Supabase with the lighter schema + indexes.
2. **Ingestion pipeline v2** (folder-drop, contracts, splitting, inference-on-write, edges, logs).
3. **All clients re-ingested fresh**, inferred + bucketed, embedded.
4. **Campaigns** synced from Airtable (reference only — NOT deals; deals are Week 3).
5. **QA harness** green.
6. API skeleton + regenerated OpenAPI reading V1.

---

## 10b. What Week 1 is NOT (scope honesty)

Foundation only. Deferred: `copy_metrics` sync + per-variant `positive_rate` (Wk2), copy
editor with variants (Wk2), full attribution reporting off `deals` (Wk3), dashboard V1
(Wk4), skills v2 + email (Wk5), inbox/leads (later). It fits one week only because the MVP
proved the hard parts — we upgrade the agents, not start blind. **Cut line if it slips:**
schema + re-ingest + QA must land; API skeleton + new-folder ingestion can spill to Wk2.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Bucket vocab too coarse/fine | Lock function/seniority/size buckets Mon with Aaman; text+embedding still captures nuance for fuzzy queries |
| Inference inconsistency across runs | Infer once at ingest + store; deterministic buckets for anything counted |
| Re-embed cost/time | One incremental (NULL-only) batch worker |
| Multi-call splitting misfires | Fallback to single-call + flag for manual split |
| Rebuild loses something | Fresh re-ingest from raw files on disk; MVP stays live until cutover |

---

## 12. Open questions to confirm Monday

1. Bucket vocabularies — final `job_function` / `seniority` / `employee_range` lists.
2. Sub-niche depth — how granular does inferred `sub_niche` go?
3. Deals sync cadence — realtime-ish vs. nightly.
4. Cutover timing — when V1 replaces the live MVP endpoint (target end of sprint).
