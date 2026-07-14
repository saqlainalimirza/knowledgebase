# Backend Guide (for developers)

The backend is two parts:
1. **Python agents** (in `agents/`) — the "brain": they read messy data, use AI, and write clean rows to the database.
2. **API routes** (inside the Next.js app, in `frontend/app/api/`) — HTTP endpoints the UI (and outside AI tools) call. Some of them just run the Python agents.

Everything talks to the same **Supabase** database and to **Gemini** (Google's AI, used for BOTH understanding text and making embeddings).

---

## Big picture

```
raw data (transcripts, CSVs, forms, Airtable)
      │
      ▼
Python agents  ──uses Gemini to think──►  writes clean rows + embeddings ──►  Supabase
      ▲                                                                          │
      │                                                                          ▼
Next.js API routes ──(read)──────────────────────────────────────────────► reads Supabase
      │            ──(actions: run an agent)──► spawns the Python agent
```

**One golden rule:** the AI does the *thinking* (understand text, infer niche, extract pains). The *saving* goes through fixed, safe code so duplicates and embeddings never break. Never hand-write inserts or embeddings.

---

## Part 1 — The Python agents (`agents/`)

Setup: `python3 -m venv .venv` → `.venv/bin/pip install -r requirements.txt` → copy `.env.example` to `.env` and fill keys (`SUPABASE_DB_URL`, `GEMINI_API_KEY`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`). Run scripts from the `agents/` folder.

### Shared helpers (`agents/connections/` and `agents/shared/`)
- **`connections/supabase.py`** — one database connection + `resolve_client()` (turns a name/slug into the real client).
- **`connections/gemini.py`** — the ONE place that talks to Gemini: `embed_documents()` / `embed_query()` (make embeddings) and `extract_json()` (ask the AI and get clean JSON back). Everyone uses this so the AI model never differs.
- **`connections/airtable.py`** — read the Airtable base (clients, campaigns, deals).
- **`shared/writers.py`** — the ONLY code that inserts rows (clients, pains, case studies, calls, copy). It handles de-duplication (no repeats).
- **`shared/embed.py`** — fills any empty embedding. Run after writing.
- **`shared/chunk.py`** — cuts a transcript into small pieces.
- **`shared/taxonomy.py`** — the niche tagging: takes messy niche text → matches it to the canonical `niches` list using embeddings → sets `niche_id`. Won't overwrite a human's choice.

### The agents (each is one job)
| Script | What it does |
|---|---|
| `onboarding_agent.py` | Reads an onboarding form → creates the client + extracts pains. Also auto-tags the niche. |
| `transcript_agent.py` | Takes a call transcript → saves it, chunks it, and mines pains from it. |
| `case_study_agent.py` | Takes pasted case studies → splits them, scores each S–D tier, saves them. |
| `campaign_sync_agent.py` | Pulls a client's campaigns from Airtable into the DB. |
| `niche_synth_agent.py` | Builds the "niche brain" — clusters everyone's pains in a niche and writes a summary. |
| `copy_agent.py` | Saves a finished copy + its 6 components. |
| `search_agent.py` | Semantic search over pains/calls/case studies/copies. Also does the **weighted ranking** (see below). |
| `cluster_pains.py` | Groups near-duplicate pains so you can see the common ones. |
| `gdoc_fetch.py` | Downloads public Google Docs/Drive files as text. |

### How agents run
Example: `.venv/bin/python transcript_agent.py --client kynship --source-call-id kynship_call1 --file call.txt`. Each agent: resolves the client → uses Gemini to understand → writes via the safe writers → fills embeddings.

### Weighted ranking (important logic)
`search_agent.py` doesn't just return the closest match. For **copies** it ranks by:
`relevance × performance × recency`
- **relevance** = how well it matches your search.
- **performance** = success **per send** (meetings ÷ sends, replies ÷ sends), adjusted for sample size — so a copy with 10 meetings on 5,000 sends loses to 5 on 200.
- **recency** = older copy counts for less (decays over ~6 months); very old ones get an `aged` flag.
For **pains** it uses `confidence × recency`; for **case studies** `tier × recency`. So confirmed pains and S-tier proof rise to the top.

---

## Part 2 — The API routes (`frontend/app/api/`)

These are HTTP endpoints. **Read** routes query Supabase directly. **Action** routes run a Python agent behind the scenes.

### Read endpoints
- `GET /api/clients` — all clients + counts.
- `GET /api/clients/{slug}` — one client's full detail (pains, case studies, calls, campaigns, niche brain).
- `GET /api/clients/{slug}/stats` — **live** performance numbers pulled from Airtable (sent, replies, meetings, rates).
- `GET /api/clients/{slug}/copies` — a client's copies + campaigns.
- `GET /api/graph` — the knowledge-graph data (nodes + links) for the visual graph page.
- `GET /api/niches` — the canonical niche/sub-niche list (for dropdowns).
- `GET /api/openapi` — a machine-readable list of all endpoints (so an outside AI can use them).

### Action endpoints (these run agents)
- `POST /api/search` — semantic search. Body: `{ type, query, niche?, route?, limit }`. `route:true` first finds the best niche, then searches inside it.
- `POST /api/clusters` — cluster a niche's pains.
- `POST /api/agents/onboarding | case-study | transcript | campaign-sync | niche-synth | save-copy` — run that agent with the given input.
- `PATCH /api/clients/{slug}/niche` — **human override** of a client's niche (sets `niche_source='human'`).
- `POST /api/copy/link` — connect a copy to a campaign.

### How an action route works (`frontend/lib/agents.ts`)
It spawns the Python agent (`spawn(pythonBin, [script, ...args])`), captures its output, strips warning noise, and returns it. Pasted text (a form, a transcript) is first written to a temp file, then passed to the agent with `--file`.

---

## Keys / environment
- `SUPABASE_DB_URL` — the Postgres connection string.
- `GEMINI_API_KEY` — for AI + embeddings.
- `AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID` — to read Airtable (base `appP3VJXaEqNopR1l`).
- On the server (Railway): `PYTHON_BIN` + `AGENTS_DIR` tell the API where the Python agents live.

## Deploy
One Docker image runs Node + Python together (the web server spawns the agents). See `DEPLOY.md`. Live at the Railway URL.

---

## Scheduled syncs (added July 14)

The container keeps its own data fresh — no external cron needed:
- **`agents/daily_sync.py`** — one orchestrator: campaign sync → campaign stats → deals
  sync → niche brains → embedding sweep, for every active client. Each step is isolated
  (one failure doesn't stop the rest). Every run writes a row to the **`sync_log`** table.
- **In-process scheduler** — `frontend/instrumentation.ts` + `lib/cron.ts` fire the
  orchestrator daily at `SYNC_UTC_HOUR` (default 05:00 UTC). Set `DISABLE_CRON=1` to turn
  it off (e.g. local dev against prod DB).
- **Manual trigger**: `POST /api/cron/run` (optional `?only=stats,deals` subset; if
  `CRON_SECRET` env is set, `?key=` is required). Fire-and-forget — returns immediately.
- **Visibility**: `GET /api/cron/status` — last 10 runs with duration + per-step summary.
