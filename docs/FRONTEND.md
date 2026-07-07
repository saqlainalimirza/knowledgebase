# Frontend Guide (for developers)

The frontend is a **Next.js 14** app (App Router) in the `frontend/` folder, written in
**TypeScript** and styled with **Tailwind CSS**. It's the control panel: you view every
client's data, feed new data in, search the memory, write copy, and see a knowledge graph.

**Important idea:** the frontend does two kinds of work:
1. **Reads** data straight from the Supabase database (server-side, using the `pg` library).
2. **Runs actions** (like "ingest this transcript") by calling API routes that spawn the Python agents.

So the UI is thin — the heavy work is in the backend. See BACKEND.md.

---

## Run it
```bash
cd frontend
npm install
# .env.local already has the DB URL, Airtable key, agents path
npm run dev        # opens http://localhost:3000
```
Needs the Python agents set up too (the action buttons call them).

---

## Folder map
```
frontend/
  app/                # pages + API routes (App Router: a folder = a URL)
    page.tsx                     # "/" dashboard
    clients/[slug]/page.tsx      # one client's page
    clients/[slug]/copy/page.tsx # copy editor for a client
    clients/new/page.tsx         # onboard a new client
    search/page.tsx              # semantic search
    graph/page.tsx               # knowledge graph
    api/...                      # backend endpoints (see BACKEND.md)
  components/         # reusable UI pieces (client-side)
  lib/
    db.ts            # database connection (Postgres pool)
    agents.ts        # runs a Python agent from an API route
    airtable.ts      # reads Airtable for live stats
```

**Rule of thumb (App Router):**
- Files under `app/.../page.tsx` are **pages** (a URL). Ones that read the DB run on the **server**.
- Files in `components/` that say `"use client"` at the top run in the **browser** (they have buttons, forms, state).

---

## The pages

### Dashboard — `/`
Lists every client as a card with counts (calls, pains, case studies, campaigns, copies) and a top row of totals. Click a client → their page.

### Client page — `/clients/{slug}`
The main screen for one client:
- **Header** — name + a **niche override** control (`NicheOverride` component): shows the client's niche; click "override" to pick a different canonical niche/sub-niche. A ✎ means a human set it.
- **Live stats band** (`ClientStats`) — real numbers from Airtable, with a This Week / This Month / All Time toggle: messages sent, positive replies, meetings booked, conversion rate, plus a **campaign performance table**.
- **Action tabs** (`ClientActions`) — feed data in: add case studies, add a transcript, sync campaigns, synthesize the niche. Each tab has a form; hitting the button calls an API route that runs the matching Python agent, and shows the result.
- **Knowledge sections** — pains & voice, case studies, calls/docs, and the niche brain summary.

### New client — `/clients/new`
A form (`NewClientForm`): paste the onboarding form + client info → runs the onboarding agent → creates the client and extracts pains.

### Copy editor — `/clients/{slug}/copy`
`CopyManager` component: write a copy (t1, t2 + the 6 components), pick a campaign to connect it to, and save. Also lists existing copies and lets you re-link them.

### Search — `/search`
`SearchPanel` component: type a plain-English query, pick what to search (pains, calls, case studies, copies, components). "Smart routing" first finds the most relevant niche, then searches inside it. Results show a relevance score.

### Graph — `/graph`
`GraphView` component: a visual map of how everything connects — niche → client → pains/campaigns/case studies/calls, with lines showing links (e.g. a pain → the call it came from). You can **drag nodes**, zoom, expand/collapse, and hover to highlight connections. Also has a "Pain clusters" view (groups of similar pains) and "Niche cards" view.

---

## Key shared files
- **`lib/db.ts`** — makes one shared Postgres connection pool. Use `q(sql, params)` to query. SSL is on (Supabase needs it).
- **`lib/agents.ts`** — `runAgent(script, args)` spawns a Python agent and returns its text output; `writeUpload()` saves pasted text to a temp file first.
- **`lib/airtable.ts`** — `getRecord()` / `listRecords()` to read Airtable for the live stats.

## Components (in `components/`)
| Component | Used on | Does |
|---|---|---|
| `ClientStats` | client page | live Airtable KPIs + campaign table |
| `ClientActions` | client page | the "feed data" tabs (calls the agents) |
| `NicheOverride` | client page | human override of the niche |
| `CopyManager` | copy page | write + link copy |
| `NewClientForm` | new client | onboard a client |
| `SearchPanel` | search page | semantic search UI |
| `GraphView` | graph page | the interactive knowledge graph |
| `Console` | shared | shows an agent's output/result |

---

## Styling
Tailwind CSS. Shared classes live in `app/globals.css` (e.g. `.card`, `.btn`, `.chip`, `.tile`, `.badge`, `.tbl`). Dark theme. Keep new UI consistent by reusing these classes.

## Gotchas
- The DB password has `$$` in it — in `.env.local` it must be written `\$\$` (Next escapes `$`). On Railway use the raw password (no escaping).
- Action buttons can take a minute (they run AI agents). That's normal.
- This is an internal tool — it reads the DB directly and runs local scripts. Keep it behind login; don't expose it publicly as-is.
