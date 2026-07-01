# Scaletopia Evergreen — V1 Design & 6-Week Build Plan

A ground-up rebuild of the Evergreen system. The MVP validated the concept and exposed
the structural limits; V1 is the robust, production architecture we build on. This is the
design and the sprint, with concrete schemas, services, and weekly deliverables.

---

## 1. Objective

A first-party intelligence layer that turns every client's calls, research, copy, and
campaign results into structured, embedded, **cross-client** knowledge — and serves it to
AI skills that draft outbound copy (SMS first, email next) at strategist quality, with
real attribution back to what converted.

**V1 is a clean rebuild**, not a patch on the MVP. MVP data migrates in; the schema,
ingestion, retrieval, and APIs are redesigned for scale and future modules (inbox,
leads) without breaking changes.

---

## 2. What the MVP taught us (design drivers)

1. **Taxonomy was too flat.** A single `niche` ("DTC ecom") can't express the way we
   actually segment (sub-niche, and above all **job title** + **company size**). The
   retrieval value lives in those finer cuts.
2. **No attribution.** Copy wasn't connected to campaigns/variants/results, so the
   "learn from winners" loop never closed. This must be first-class.
3. **Copy is multi-variant per campaign.** One campaign runs A/B/C; results attach per
   variant. The model must represent variants, not one-copy-per-campaign.
4. **Not every client has calls.** We need a first-class place for analyst research so a
   client with zero transcripts is still usable and cross-linked.
5. **Ingestion of mixed inputs works** (transcripts/docs/CSV → chunk → embed) and should
   be kept as the one write path, hardened.
6. **Cross-client-by-niche is the core advantage** and must be preserved and extended to
   cross-**role** (e.g. "what every CMO across e-com says").

---

## 3. Target architecture

```
 Ingestion (one path)          Core store (Supabase + pgvector)            Serving
 ─────────────────────         ────────────────────────────────           ───────────────
 transcripts / docs            entities:  clients, contacts(role,size)     REST API (typed)
 onboarding forms       ─────▶  knowledge: pains, lingo, case_studies  ───▶ + OpenAPI
 analyst research (drafts)      copy:      copies(variant), components        retrieval svc
 Airtable (campaigns,           results:   campaigns, copy_metrics, deals      (route+rank)
   metrics, deals)              graph:     edges (provenance + similarity)    skills (SMS/email)
                                tagging:   niche, sub_niche, job_title,       dashboard + graph
                                           employee_range  (everywhere)
        every text → embedding (one Gemini path) → searchable
```

Principles carried from MVP, enforced in V1:
- **Exact keys for identity** (belongs-to joins), **embeddings for similarity** (route,
  cluster, relate). Never let a similarity score decide a structural join.
- **One ingestion path**, one embedding path, dedup-safe writers.
- **Tagging is a shared dimension**, not per-table strings — so search/graph/skills all
  filter the same way.

---

## 4. Data model (V1 schema)

### 4.1 Tagging (the backbone)
A normalized tag layer instead of free-text columns scattered around.

- `niches(id, name, parent_id NULL, embedding)` — hierarchy: niche → sub_niche via
  `parent_id`. `embedding` lets us merge spelling variants and route queries.
- `job_titles(id, canonical, aliases[], seniority, function)` — e.g. canonical "VP of
  Marketing", function=marketing, seniority=VP; aliases map raw titles in.
- `employee_ranges(id, label, min, max)` — e.g. "50–100".
- Generic `entity_tags(entity_type, entity_id, niche_id, sub_niche_id, job_title_id, employee_range_id)`
  so pains, case studies, copies, contacts all tag the same way.

### 4.2 Clients & contacts
- `clients(id, slug, name, airtable_client_id, offer, primary_niche_id, sub_niche_id, status, retainer, account_manager)`
- `contacts(id, client_id NULL, name, raw_title, job_title_id, employee_range_id, company, source)`
  — the people on calls / in deals; lets us answer "what does a CMO say."

### 4.3 Knowledge (voice of customer)
- `calls(id, client_id, source_call_id, title, date, source, raw_transcript)`
- `call_chunks(id, call_id, client_id, chunk_index, text, embedding)`
- `pains(id, client_id, contact_id NULL, kind[pain|lingo|dream|belief|objection], text, confidence, source_ref, embedding)`
  — tagged via `entity_tags` (niche/sub_niche/job_title).
- `case_studies(id, owner_client_id, subject_brand, tier, before_state, after_state, notable_results, timeframe, mechanism, unique_mechanism, source_ref, embeddings[result, mechanism, niche])`
- `client_drafts(id, client_id, author, title, body, source, embedding)` **(new)** —
  analyst research for clients without calls; embedded + cross-linked like pains.

### 4.4 Copy & components
- `copies(id, client_id, campaign_id NULL, variant[A|B|C|...], channel[sms|email], t1, t2, char_t1, char_t2, lever, pattern, unique_mechanism, cta, status[draft|live|winner|loser], why_worked, why_failed, lineage, embeddings[full, t1, mechanism])`
  — **many copies per campaign**, distinguished by `variant`.
- `copy_components(id, copy_id, component_type, text, verdict, embedding)`

### 4.5 Results & attribution
- `campaigns(id, airtable_campaign_id, client_id, name, niche_id, sub_niche_id, segment, angle, channel, variant, start_date)` — synced from Airtable; variant captured.
- `copy_metrics(id, copy_id, campaign_id, variant, period_start, period_end, sent, positive_replies, booked, region)` — per **copy+variant**; real `positive_rate` derived.
- `deals(id, campaign_id, contact_id, job_title_id, employee_range_id, value, stage, created_at)` **(new)** — campaign → deal → role/size.
- `conversations(id, deal_id NULL, contact_id, copy_id NULL, transcript, embedding)` **(new, later)** — the reply threads behind a deal, for "why they said yes/no."

### 4.6 Graph edges
- `edges(src_type, src_id, dst_type, dst_id, kind)` — provenance (pain→call, copy→campaign,
  campaign→deal) computed from FKs; similarity (niche↔niche, pain cluster) computed from
  embeddings. One table powers the graph.

**Indexes:** ivfflat/hnsw on every embedding column; btree on all tag FKs.

---

## 5. Retrieval & embeddings

- **Routing:** query → embed → nearest niche/sub_niche (and optionally job_title) → scope.
- **Cross-client / cross-role:** pool by `niche_id` OR by `job_title_id` — e.g. "every
  CMO across e-com" ignores niche and groups by role.
- **Clustering:** greedy cosine (≥0.82) over pains within a scope → dominant points with
  `client_count` / `role_count`.
- **Ranking signals:** confidence (confirmed>needs_more), tier (S>A>B), `positive_rate`
  (real), client_count/role_count, cosine score.
- One Gemini embedding model end to end; never embed in a skill.

---

## 6. Attribution model (the loop that was missing)

```
copy(variant) ──in──▶ campaign ──produced──▶ deals ──by──▶ contact(job_title, employee_range)
     │                    │                                         │
 copy_metrics(sent, positive, booked, per variant)          conversations (replies)
```
A strategist uploads a copy, selects **campaign + variant**; metrics auto-attach from
Airtable; deals link the campaign to real contacts and their roles. The skill can then
ask: *which lever/variant wins for CMOs at 50–100-person DTC brands* — and see the
conversations behind those wins.

---

## 7. API surface (typed + OpenAPI)

- Entities: `GET /clients`, `/clients/{id}`, `/contacts?role=&size=`
- Retrieval: `POST /search {scope:{niche?,sub_niche?,job_title?}, type, query, route, limit}`
- Clusters: `POST /clusters {scope}` (by niche or by role)
- Copy: `POST /copies` (with campaign+variant), `POST /copies/{id}/metrics`
- Attribution: `GET /campaigns/{id}/deals`, `GET /roles/{title}/insights`
- Graph: `GET /graph?focus=&depth=`
- Ingestion: `POST /ingest/transcript|draft|onboarding`
- Drafts: `POST /clients/{id}/drafts`

---

## 8. Ingestion pipeline (hardened)

One service accepts any input form (transcript, doc, CSV, onboarding form, analyst
draft, Airtable sync), normalizes → chunks → embeds → writes with dedup, and emits the
graph edges. Folder-drop friendly: a per-client Drive folder can be batch-ingested.

---

## 9. Skills

- **SMS skill v2:** multi-angle retrieval (pains, lingo, tiered proof, winners by
  `positive_rate`, role-specific insights) at a controllable depth; quality bar =
  first-take 7–8/10. Tightened prompt + few-shot from real winners.
- **Email skill:** same data, channel-specific formatting.
- Both consume the OpenAPI; no data duplicated into repos.

---

## 10. Dashboard & graph

- Full per-client context page (calls, pains by kind, lingo/dream/belief, case studies,
  keywords, campaigns, **real per-variant stats**).
- Graph with the new tags: filter by niche/sub_niche/**job title**/size; provenance +
  similarity + attribution edges; drag/pin/hover (kept from MVP).

---

## 11. Migration from MVP

- Map MVP `client_roster`/`master_sheet_pains`/`case_studies`/`campaigns`/`call_chunks`
  into the V1 schema; backfill `niche_id`/`sub_niche_id` from the existing text; infer
  `job_title_id` from pain `persona` where present.
- Re-embed under the V1 embedding config once.
- Load the Week-0 backfill (copies + metrics + drafts) into the new tables.

---

## 12. Six-week build plan

| Week | Engineering deliverables |
|---|---|
| **0** | Finalize schema + ERD; stand up the 2 engineers; provision V1 Supabase; ingest the Week-0 Drive (transcripts, copies+campaigns, drafts). |
| **1** | **Schema + tagging layer** built (niches hierarchy, job_titles, employee_ranges, entity_tags); ingestion pipeline writing into V1; MVP data migrated + re-embedded. |
| **2** | **Copy + variants + metrics**: upload copy with campaign+variant; `copy_metrics` sync from Airtable; per-variant `positive_rate`; backfill supplied copies. |
| **3** | **Attribution**: `deals` wired (campaign→deal→contact role/size); role-scoped retrieval + clusters ("CMO across e-com"); `client_drafts` ingested + cross-linked. |
| **4** | **Dashboard + graph V1**: full per-client context; tag/role filters; attribution + provenance edges; better stats. |
| **5** | **Skills**: SMS v2 to first-take quality (few-shot from real winners); **email skill**; retrieval tuning. |
| **6** | **Hardening + enablement**: indexes/perf, future-proofing seams (inbox/leads), SOPs + recorded Claude session, QA, V1 sign-off. |

Cadence: weekly demo/review call (logic check); engineering owns technical execution.

---

## 13. Team, resourcing & why 2 engineers

The 6-week deadline is only achievable by running **three parallel lanes**. The
workstreams (§section 4–10) don't fit one person in six weeks — solo this is ~12 weeks.
Two AI engineers let the lead stay on the hard IP (architecture, retrieval, skills)
while backend and full-stack proceed in parallel.

**Lane 1 — Lead / architect (Hilal):** schema + tagging design, retrieval core
(routing, clustering, cross-role), SMS + email skills, coordination, QA sign-off.
**Lane 2 — AI Engineer A (data / backend):** ingestion pipeline, DB build + migrations,
Airtable sync (campaigns, **copy_metrics**, **deals**), attribution wiring, embedding
jobs, indexes/perf.
**Lane 3 — AI Engineer B (full-stack):** typed API layer, dashboard (full client
context + **per-variant stats**), graph V1 with tag/role filters, copy editor
(variant + metrics UX), SOP tooling.

| Week | Lead (Hilal) | Engineer A (data/backend) | Engineer B (full-stack) |
|---|---|---|---|
| 0 | ERD + schema lock | provision V1 DB, batch-ingest Drive | scaffold app + API skeleton |
| 1 | tagging + retrieval design | schema + migrations + ingestion pipeline | API layer + client pages |
| 2 | retrieval tuning | copy_metrics sync + variant model | copy editor: campaign+variant+metrics UI |
| 3 | role-scoped retrieval/clusters | **deals** + attribution wiring | graph tag/role filters |
| 4 | skills prep + few-shot mining | perf/indexes + drafts ingestion | dashboard V1 + attribution views |
| 5 | **SMS v2 + email skills** | data QA + backfill load | skill-facing UI + SOP tooling |
| 6 | acceptance + sign-off | hardening/perf + seams (inbox/leads) | polish + recorded-session support |

**Where they add value concretely:** Engineer A owns the two pieces the MVP never had —
the **attribution loop** (copy→variant→campaign→deal→role) and reliable **Airtable metric
sync** — plus migration and pgvector performance at scale. Engineer B owns everything the
strategist and Aaman actually touch — the **dashboard, graph, and copy/variant UI** — so
it's usable, not just an API. This keeps the lead 100% on the retrieval + skills quality
that is the product's edge.

- Strategist(s): weekly copy + outcome entry via dashboard.
- Weekly 30-min review (catch logical/strategy gaps early).

---

## 14. Out of scope this sprint (designed-for, built later)

- Live inbox-management + reply-reason analysis (`conversations` schema seam built now).
- Leads-inventory system connection.
- Automated/triggered skill runs.

---

## 15. Open decisions

1. **Sub-niche taxonomy**: controlled list vs. free text → recommend controlled list,
   embedding-normalized so variants auto-merge.
2. **Job-title canonicalization**: maintained alias map vs. on-the-fly LLM mapping →
   recommend a seed alias map + LLM fallback.
3. **Variant attribution granularity**: per-variant vs. per-send-batch.
4. **Backfill volume**: target 25 win / 20 lose per client; accept fewer if needed,
   prioritize coverage across all clients.

---

## 16. Acceptance criteria (V1 done)

1. Strategist produces a **7–8/10 first-take** SMS in ~20 min using the skill + system.
2. **Per-variant attribution** live: each copy shows real `positive_rate` and the
   deals/roles it drove.
3. Retrieval works by **niche, sub-niche, and job title** (incl. cross-niche role cuts).
4. Clients **without calls** fully usable via `client_drafts`, cross-linked.
5. **Email skill** live on the same data.
6. New strategist runs a client end-to-end from SOPs + recorded session.
