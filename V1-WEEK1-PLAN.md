# V1 — Week 1 Detailed Plan (Foundation)

Turns the locked Week-0 design into a running foundation: the V1 schema + tagging
layer live, one hardened ingestion pipeline writing into it, all MVP data migrated and
re-embedded under the new model, and the API/front-end reading V1. Companion to
[V1-BUILD-PLAN.md](V1-BUILD-PLAN.md).

> **Why this is the make-or-break week.** Everything downstream (attribution, skills,
> dashboard) reads the tagging + schema built here. If the taxonomy and migration are
> right, Weeks 2–6 are additive. If they're rushed, we pay for it every week after. So
> Week 1 optimizes for a *correct, verified* foundation over feature count.

---

## 0. Entry criteria (from Week 0)

- Locked ERD + schema decisions (§15 of the build plan resolved).
- A **separate V1 Supabase project** (staging) — the live MVP keeps running untouched.
- Aaman's Drive inputs landing (transcripts, copies+campaigns, drafts).

---

## 1. Week-1 objectives (Definition of Done)

By Friday, all true if:
1. V1 schema + **tagging layer** (niches hierarchy, job_titles, employee_ranges,
   entity_tags) created **and seeded** from real data.
2. **Ingestion pipeline v2** ingests any input (transcript / case study / onboarding /
   draft / Airtable) → normalize → chunk → embed → dedup → write → tag → emit edges,
   idempotently, from a folder drop.
3. **All 7 MVP clients migrated** into V1 with niche_id/sub_niche_id backfilled,
   job_title inferred where possible, and **re-embedded** under the V1 config.
4. **Vector indexes** (ivfflat/hnsw) on every embedding column; tag FKs indexed.
5. **API skeleton** reads V1 (clients list/detail, search) + regenerated OpenAPI.
6. **QA harness** passes: 0 missing embeddings, 0 orphan tags, counts match source.

---

## 2. Guiding principles (the "why" behind the order)

- **Staging isolation.** Build on a new project so the live MVP (7 clients, deployed)
  is never at risk during the rebuild. Cut over only when V1 is proven.
- **Schema → ingestion → migrate → verify**, in that order. You can't migrate into a
  schema that isn't final, and you can't trust a migration you haven't verified.
- **Tags are IDs, not strings.** The MVP's #1 failure was free-text `niche`. Every tag
  becomes a foreign key to a canonical row so search/graph/skills filter identically.
- **Idempotent everything.** Re-running ingestion or migration must not duplicate. This
  is what lets us iterate safely all week.
- **Seed taxonomy from data we already have** (below) — don't hand-invent it.

---

## 3. The Week-1 schema (DDL built this week)

Core + tagging. (Attribution tables `deals`/`conversations` are stubbed now, filled Wk3.)

```sql
-- ---------- tagging layer ----------
create table niches (
  id            bigserial primary key,
  name          text not null,
  parent_id     bigint references niches(id),   -- niche -> sub_niche
  slug          text unique not null,
  embedding     vector(1536),                    -- for variant-merge + routing
  created_at    timestamptz default now(),
  unique (name, parent_id)
);
create table job_titles (
  id            bigserial primary key,
  canonical     text unique not null,            -- "VP of Marketing"
  aliases       text[] default '{}',             -- ["VP Marketing","V.P. Mktg"]
  function      text,                             -- marketing | sales | exec | ops
  seniority     text,                             -- C-level | VP | Director | Founder
  embedding     vector(1536)
);
create table employee_ranges (
  id            bigserial primary key,
  label         text unique not null,            -- "50-100"
  min_size      int, max_size int
);
-- one polymorphic tag row per entity, so pains/copies/contacts/case_studies tag alike
create table entity_tags (
  id               bigserial primary key,
  entity_type      text not null,                -- 'pain'|'copy'|'contact'|'case_study'|'campaign'
  entity_id        bigint not null,
  niche_id         bigint references niches(id),
  sub_niche_id     bigint references niches(id),
  job_title_id     bigint references job_titles(id),
  employee_range_id bigint references employee_ranges(id),
  unique (entity_type, entity_id)
);

-- ---------- entities ----------
create table clients (
  id bigserial primary key, slug text unique not null, name text not null,
  airtable_client_id text, offer text,
  primary_niche_id bigint references niches(id),
  sub_niche_id bigint references niches(id),
  status text, retainer numeric, account_manager text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table contacts (
  id bigserial primary key, client_id bigint references clients(id),
  name text, raw_title text, job_title_id bigint references job_titles(id),
  employee_range_id bigint references employee_ranges(id), company text, source text
);

-- ---------- knowledge ----------
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
  contact_id bigint references contacts(id),
  kind text check (kind in ('pain','lingo','dream','belief','objection')),
  text text not null, confidence text, source_ref text, embedding vector(1536)
);
create table case_studies (
  id bigserial primary key, owner_client_id bigint references clients(id),
  subject_brand text, tier text, before_state text, after_state text,
  notable_results text, timeframe text, mechanism text, unique_mechanism text,
  source_ref text unique, result_embedding vector(1536),
  mechanism_embedding vector(1536), niche_embedding vector(1536)
);
create table client_drafts (           -- for clients with no calls (GoFish etc.)
  id bigserial primary key, client_id bigint references clients(id),
  author text, title text, body text, source text, embedding vector(1536)
);

-- ---------- copy & results (schema now, behavior Wk2-3) ----------
create table campaigns (
  id bigserial primary key, airtable_campaign_id text unique, client_id bigint references clients(id),
  name text, niche_id bigint references niches(id), segment text, angle text,
  channel text, variant text, start_date date
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
create table copy_metrics (
  id bigserial primary key, copy_id bigint references copies(id),
  campaign_id bigint references campaigns(id), variant text,
  period_start date, period_end date, sent int, positive_replies int, booked int, region text
);
create table deals (                    -- stub now, wired Wk3
  id bigserial primary key, campaign_id bigint references campaigns(id),
  contact_id bigint references contacts(id), job_title_id bigint references job_titles(id),
  employee_range_id bigint references employee_ranges(id), value numeric, stage text, created_at timestamptz
);

-- ---------- graph ----------
create table edges (
  id bigserial primary key, src_type text, src_id bigint, dst_type text, dst_id bigint, kind text,
  unique (src_type, src_id, dst_type, dst_id, kind)
);

-- ---------- indexes (do NOT skip — retrieval perf depends on this) ----------
create index on call_chunks       using ivfflat (embedding vector_cosine_ops);
create index on pains             using ivfflat (embedding vector_cosine_ops);
create index on case_studies      using ivfflat (result_embedding vector_cosine_ops);
create index on copies            using ivfflat (full_embedding vector_cosine_ops);
create index on niches            using ivfflat (embedding vector_cosine_ops);
create index on entity_tags (niche_id); create index on entity_tags (job_title_id);
create index on entity_tags (entity_type, entity_id);
```

---

## 4. Taxonomy seeding — the piece most plans miss

We do **not** hand-invent niches/titles. The signal already exists in our data; Week 1
extracts and canonicalizes it:

1. **Verticals from Airtable campaign names.** Campaigns encode the real segments, e.g.
   `Acceler8 - CPG Food & Bev | 3-200E | US & Canada | V1` →
   sub_niche "CPG Food & Bev", employee_range "3-200". Parse all campaign names across the
   14 active clients → candidate sub-niches + employee ranges.
2. **Job titles from `clietns.txt` + onboarding forms.** The clients table lists ICP job
   titles (CMO, VP Marketing, Founder, Head of Growth…). Onboarding forms list ICP titles.
   Seed `job_titles` with canonical + aliases + function/seniority.
3. **Personas from MVP pains.** `master_sheet_pains.persona` and case-study owners give
   more raw titles → map to canonical job_titles.
4. **Embedding-dedup the candidates.** Cluster candidate niche/title strings by embedding
   (cosine) so "DTC ecom" / "DTC Ecommerce" / "D2C" collapse to one canonical row — this
   is the fix for the exact-string brittleness we hit in the MVP.
5. **Human confirm the top level.** Hilal + Aaman review the generated niche → sub_niche
   tree once (30 min) before it's locked. Controlled list, embedding-normalized.

**Why in Week 1:** every downstream table tags against these rows, and the migration
(§6) needs them to backfill. Seeding late blocks everything.

---

## 5. Ingestion pipeline v2 (spec)

One service, one write path, hardened over the MVP agents:

- **Inputs:** transcript, case-study text/CSV, onboarding form, analyst draft, Airtable
  sync. **Folder-drop**: point it at a per-client Drive folder, it ingests everything.
- **Transcript splitting (missed in MVP).** MVP ingested multi-call files as one call
  (Redo/Digital Resource were single huge calls). V2 splits on call boundaries
  (URL headers / speaker resets / "Call N") so each real call is its own record with
  correct provenance.
- **Data contracts.** A JSON schema per input type is the seam between LLM extraction and
  the dedup-safe writer (extend the MVP contract). LLM fills the contract; the writer
  validates + inserts; nothing hand-writes SQL.
- **Tagging on write.** Every pain/case/copy/contact gets an `entity_tags` row
  (niche/sub_niche/job_title inferred at ingest).
- **Edges on write.** pain→call, copy→campaign, campaign→client emitted into `edges`.
- **Idempotent + logged.** Dedup keys enforced; each run writes a log (inserted/updated/
  skipped) so we can trust the result.

---

## 6. MVP → V1 migration (step-by-step + verification)

Migrate the 7 live clients into V1. **Non-destructive** (MVP stays up).

| MVP source | V1 target | Transform |
|---|---|---|
| `client_roster` | `clients` | text `niche` → `primary_niche_id` (match/create); `sub_niche` → `sub_niche_id` |
| `master_sheet_pains` | `pains` + `entity_tags` | keep text/kind/confidence; `persona` → `job_title_id`; niche → niche_id |
| `case_studies` | `case_studies` + `entity_tags` | 1:1 + tag |
| `call_chunks` / calls | `calls` + `call_chunks` | re-associate to `client_id` |
| `campaigns` | `campaigns` | parse name → niche_id/segment/variant |
| `copies`/`components` | `copies`/`copy_components` | + `variant` (default A) |

Steps: (1) seed taxonomy §4 → (2) migrate clients → (3) migrate knowledge with tag
backfill → (4) **re-embed** everything under the V1 embed config (one batch worker) →
(5) run QA harness.

**Verification (QA harness — this is a deliverable, not optional):**
- per-client counts in V1 == MVP (calls, pains, cases, campaigns).
- `select count(*) ... where embedding is null` == 0 across all vector cols.
- every knowledge row has an `entity_tags` row with a non-null `niche_id`.
- no `entity_tags` pointing at a missing niche/title (referential check).
- spot-check: routed search for "rising CAC" still returns DTC ecom cross-client hits.

---

## 7. Embeddings & indexing decisions (lock Week 1)

- **Model/dims:** keep Gemini `gemini-embedding-001` @ 1536 (matches MVP; avoids a
  re-embed later). One path; never embed inside a skill.
- **Batch worker:** a single re-embed job that fills any NULL vector (reused for
  migration and ongoing ingestion).
- **Indexes:** ivfflat/hnsw on every vector column **before** bulk load, tuned `lists`
  after data lands. Without these, cross-client search degrades as data grows (we're
  already at 900+ pains in one niche).

---

## 8. API skeleton (Lane 3, in parallel)

- Typed API reading V1: `GET /clients`, `/clients/{id}` (full context), `POST /search`
  with `scope:{niche,sub_niche,job_title}`.
- Regenerate **`/api/openapi`** for the new tag-aware params so the skill/front-end pick
  it up.
- Front-end points at V1 staging; no user-facing change until cutover.

---

## 9. Day-by-day

| Day | Lead (Hilal) | Engineer A (data/backend) | Engineer B (full-stack) |
|---|---|---|---|
| **Mon** | Kickoff w/ Jordan; lock schema + taxonomy rules | Create V1 project; run schema DDL + indexes | Scaffold API + point front-end at V1 staging |
| **Tue** | Build taxonomy seed (parse campaigns/titles/personas) + embedding-dedup; review tree w/ Aaman | Ingestion pipeline v2: contracts + writers + tagging | `GET /clients` + detail reading V1 |
| **Wed** | Migration mapping + re-embed config | Run migration steps 2–3 (clients + knowledge + tags) | `POST /search` w/ scope params; OpenAPI regen |
| **Thu** | Transcript-splitting rules; QA harness spec | Re-embed batch worker; ingest Aaman's new folders | Client detail full-context page on V1 |
| **Fri** | Run QA harness; sign-off review | Fix QA gaps; idempotency re-run test | Demo V1 read path; weekly review |

---

## 10. Deliverables (end of Week 1)

1. V1 Supabase with full schema + indexes.
2. Seeded, embedding-deduped **taxonomy** (niches tree, job_titles, employee_ranges).
3. **Ingestion pipeline v2** (folder-drop, contracts, splitting, tagging, edges, logs).
4. **All 7 MVP clients migrated + re-embedded**, tagged.
5. **QA harness** green (counts, embeddings, tag integrity).
6. API skeleton + regenerated OpenAPI reading V1.
7. This week's new Drive folders ingested into V1.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Taxonomy tree churns and blocks migration | Lock the top 2 levels Tue with Aaman; sub-tags can grow later |
| Re-embedding cost/time on migration | One batch worker, incremental (NULL-only), off-peak |
| Multi-call transcript splitting misfires | Fallback to single-call ingest + flag for manual split |
| Migration corrupts something | Non-destructive: V1 is a separate project; MVP untouched until cutover |
| Job-title canonicalization noisy | Seed alias map + LLM fallback; human-confirm the top functions |

---

## 12. Open questions to confirm Monday

1. Sub-niche granularity — how deep does the tree go (2 levels vs 3)?
2. Job-title functions/seniority buckets — final list.
3. Employee-range buckets — adopt Airtable's (`3-200`, `5-1000`…) or normalize.
4. Cutover timing — when V1 replaces the live MVP endpoint (target end of sprint).
