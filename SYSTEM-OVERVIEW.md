# Scaletopia Evergreen — System Overview

A one-read briefing on what this system is, how it's built, what's in it, and what's
next. For deeper detail see [DATABASE-GUIDE.md](DATABASE-GUIDE.md),
[INGESTION-PLAN.md](INGESTION-PLAN.md), and the per-folder READMEs.

Live app: **https://knowledgebase-production-f52e.up.railway.app**
Repo: `saqlainalimirza/knowledgebase`

---

## 1. The idea (in one line)

A **first-party memory** for cold-outreach: every client's calls, pains, proof, and
copy go into one DB, get embedded, and become **searchable across clients by niche** —
so writing copy is grounded in real evidence instead of guesswork, and each new client
starts informed by everyone before it.

---

## 2. Architecture at a glance

```
        RAW INPUTS                  AGENTS (Python + Gemini)          STORE (Supabase + pgvector)
  onboarding form, CSVs   ─┐    onboarding / case-study / transcript      client_roster
  call transcripts, gdocs  ├──▶ campaign-sync / niche-synth / copy   ──▶  client_calls, call_chunks 🧠
  Airtable (campaigns)    ─┘    search / cluster_pains                    case_studies 🧠, master_sheet_pains 🧠
                                       │                                  copies 🧠, copy_components 🧠
                                       │  (every write embeds via ONE     campaigns, copy_metrics
                                       ▼   Gemini path; dedup-safe)        niche_knowledge 🧠
                                 Next.js frontend  ◀──reads DB / runs agents──▶  API (/api/*) + OpenAPI
                                  dashboard · client detail · graph · search · copy editor
                                                                            │
                                                       evergreen-copywriter SKILL + /api/openapi
                                                       (an external AI writes copy off this data)
```
🧠 = has embeddings. One image on Railway runs the Next.js server, which spawns the
Python agents in-process.

---

## 3. The data model (what each table holds)

Anchor = a **client** (`client_roster`). Everything hangs off `client_slug`, and the
cross-client link is the **`niche`** text.

| Table | Holds | Embedded? |
|---|---|---|
| `client_roster` | the client (slug, niche, offer, Airtable id) | — |
| `client_calls` | full raw transcripts/docs | — |
| `call_chunks` | transcripts split into ~400-tok chunks | 🧠 |
| `case_studies` | proof, tiered S→D, deduped on source_ref | 🧠 ×3 |
| `master_sheet_pains` | pains / lingo / dreams / beliefs / objections, with confidence | 🧠 |
| `copies` + `copy_components` | finished copy + its 6 parts | 🧠 |
| `niche_knowledge` | one pooled summary per niche | 🧠 |
| `campaigns` | from Airtable (name → angle/segment/channel) | — |
| `copy_metrics` / `copy_performance` (view) | real send/reply/booking + rates | — |

Full field-by-field detail: **[DATABASE-GUIDE.md](DATABASE-GUIDE.md)**.

---

## 4. The agents (`agents/`)

Python scripts; Gemini does the thinking, dedup-safe writers do the saving, one shared
embed path fills vectors. Run via CLI or through the frontend's API.

| Agent | Does |
|---|---|
| `onboarding_agent` | onboarding form + tabs → client row + pains |
| `case_study_agent` | paste → split, **tier S–D**, dedup, embed |
| `transcript_agent` | call → chunk + embed + **mine pains** |
| `campaign_sync_agent` | pull campaigns from Airtable by client id |
| `niche_synth_agent` | cluster a niche's pains → write the pooled "niche brain" |
| `copy_agent` | save a copy + components (char counts + embed) |
| `search_agent` | semantic search + **niche routing** |
| `cluster_pains` | group near-duplicate pains (cosine ≥ 0.82) |
| `gdoc_fetch` | download public Google Docs/Drive as text |

---

## 5. The API + OpenAPI

The frontend exposes everything at `/api/*`. A machine-readable contract lives at
**`GET /api/openapi`** (OpenAPI 3.1).

- **Read / retrieve:** `GET /api/clients`, `/api/clients/{slug}`, `/api/clients/{slug}/stats`
  (live Airtable KPIs), `/api/clients/{slug}/copies`, `GET /api/graph`
- **Search angles:** `POST /api/search` `{type: pains|calls|case_studies|copies|components, query, route, niche?, status?, limit}`
- **Cluster pains:** `POST /api/clusters` `{niche}`
- **Write:** `POST /api/agents/save-copy`, `POST /api/copy/link`, plus the ingest agents

`limit` is the **more/less/medium dial**; `route:true` matches the query to the best
niche first, then searches inside it.

---

## 6. The frontend (`frontend/`, Next.js)

- **Dashboard** — every client with corpus counts + KPI tiles
- **Client detail** — live Airtable performance (sent / positive replies / booked /
  conversion, by week/month/all-time) + campaign table, then pains, case studies,
  calls, niche brain
- **Knowledge graph** — see §7
- **Search** — semantic, with smart niche routing
- **Copy editor** — write a copy (t1/t2 + 6 components), save + embed, link to a campaign

---

## 7. The knowledge graph (`/graph`)

A drill-down graph: **niche → client → category hubs → individual items**.
- Expand/collapse any node; **drag nodes** to arrange; pan + zoom; **hover to trace** a
  node's connections (e.g. a pain → the call it was mined from).
- Edges: client→niche, **pain→source call** (orange), copy→campaign (indigo),
  **client↔client** when they share a niche (green), niche↔niche by embedding similarity.
- Views: **Full graph**, **Pain clusters** (embedding groups → members), **Niche cards**.

---

## 8. Niche & cross-client logic (the important mental model)

Two kinds of connection, on purpose:

- **Exact keys = "belongs to"** (deterministic, never guessed): client→niche,
  copy→campaign, pain→its source call. These are the structural joins.
- **Embeddings = "is similar / route me there"** (fuzzy): semantic search, pain
  clustering, niche↔niche similarity, query→niche routing.

**Cross-client happens through the niche.** Two clients in the same `niche` string
share one niche brain and one pain pool. A pain raised by multiple clients shows
`client_count > 1` — the strongest signal for copy. ⚠️ The link is the **exact niche
text**, so spell it consistently ("DTC ecom" everywhere).

---

## 9. The copywriting workflow (the payoff)

An external AI loads the **`evergreen-copywriter` skill** (in `skills/`), which points
at the live API. To write copy it pulls several **angles in parallel**, each with a
controllable amount:

1. **Pains** (lead with `client_count > 1`, prefer `confirmed`)
2. **Lingo** (their words)
3. **Proof** (highest `tier`)
4. **Winners** (copy ranked by real `positive_rate`)
5. **Hooks/CTAs** (winning components)
6. **Niche brain** (pooled summary + shared lingo)

…then writes, then `save-copy` (draft), then links to a campaign (in the frontend).
Trust order: `confirmed > needs_more`, `tier S>A>B`, weight by `positive_rate`,
`client_count`, and `score` (cosine).

---

## 10. What's loaded right now

| Client | calls/docs | pains | case studies | campaigns |
|---|---|---|---|---|
| Chamber Media | 47 | 454 | 0 | 61 |
| Kynship | 21 | 473 | 11 | 19 |

- Niche **DTC ecom** pools **927 pains → 497 clusters (143 multi-member, 2 clients)**.
- Niche brain (summary + shared lingo) built across both clients.
- All embeddings filled.

---

## 11. Deployment (Railway, Docker)

One image (Node + Python). Build from the repo's `Dockerfile`. Set these in Railway →
Variables (not in the repo): `SUPABASE_DB_URL`, `GEMINI_API_KEY`, `AIRTABLE_API_KEY`,
`AIRTABLE_BASE_ID` (and optionally `EVERGREEN_PUBLIC_URL`). Details in
**[DEPLOY.md](DEPLOY.md)**.

---

## 12. Known gaps / roadmap

1. **`copies` + `copy_components` are empty** → the "proven winners" search angle
   returns nothing yet. Fills as copy is saved through the editor/API.
2. **No `copy_metrics`** → `positive_rate` is dark, so we can't yet rank by *real*
   results. Building a sync from Airtable (Daily SMS/Email stats + reply/booking
   counts) is the key next step to close the learn-from-winners loop.
3. **Case-study search projection** is minimal (no `before_state`) — easy enrich.
4. **`/api/brief`** one-call assembler (optional) — bundle all angles at a chosen depth.
5. **Niche normalizer** — embedding-merge niche-name variants so the exact-text join
   can't silently break.

---

## 13. Where things live

```
agents/      Python agents + venv + connections (Supabase, Gemini, Airtable)
frontend/    Next.js app (UI + API routes) — README inside
skills/      evergreen-copywriter SKILL.md (how an AI uses the API)
data-feeder/ original skill spec (reference)
DATABASE-GUIDE.md · INGESTION-PLAN.md · DEPLOY.md · this file
```
