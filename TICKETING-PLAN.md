# Ticketing System Plan (Bugs and Troubleshoot)

This is a private ops tool for Hilal. Bugs posted in the Slack "bugs-and-troubleshoot"
channel come into a ticket board inside Evergreen, so nothing gets missed and Aaman can
see progress if he wants.

Important: it LIVES inside Evergreen (same app, same database, same Railway deploy) so
there is no new system, no new database, no extra headache. But it is a SEPARATE section
that has nothing to do with the client knowledge. The AI (Aaman's Claude skill) can never
reach it. See "Wall between tickets and the client system" below.

Slack channel to pull from: `bugs-and-troubleshoot`, channel id `C0890LFFRAB`.

---

## What it does (in simple words)

1. A bug is posted in the bugs-and-troubleshoot Slack channel.
2. Evergreen reads that channel and turns each new message into a ticket card.
3. Hilal opens the Tickets tab and works through them each day: move a card between
   Unchecked, In Progress, and Complete, and set who it is assigned to.
4. Two ways to look at the work:
   - Today's board (one card board per day).
   - All-time board (every day, with pagination so it never gets too heavy).

---

## The board

Every ticket is a card. A card shows:
- The bug text (the Slack message).
- Who reported it (Slack user) and a link back to the original Slack message.
- The day it came in.
- An assignee dropdown.
- Which column it is in = its status.

Three columns (status):
- **Unchecked** (default when a bug first arrives)
- **In Progress**
- **Complete**

You move a card left/right to change its status (drag, or a small button). When a card
goes to Complete, the time is stamped so we know how fast it was cleared.

### Assignee
- Default on every new ticket: **Hilal**.
- Dropdown options: **Hilal, Saqlain, Himanshi, Muqtadir**.
- You can also add a new name in the dropdown (type it once, it is saved for next time).

---

## Two views

### 1. Daily view (default)
- Shows one day at a time (default = today).
- The 3-column board (Unchecked / In Progress / Complete) for just that day's tickets.
- A date picker (or prev/next day arrows) to go to any past day.
- This is the "each day I go in" board you described.

### 2. All-time view
- The same 3-column board but across ALL days, not one day.
- **Unresolved first**: Unchecked and In Progress are shown at the top so open work is
  obvious; Complete is there too.
- **Pagination**: loads a page at a time (for example 30 cards per page) so the board
  never gets overwhelmed / slow even after months of bugs.
- A small filter bar: by status, by assignee, and a text search.

A little counter on top of both views: how many Unchecked, In Progress, Complete.

---

## Where it lives in Evergreen

- A new top nav link **"Tickets"** next to Clients / Graph / Search.
- It opens its own page at `/tickets`. It is NOT inside any client. It is its own place.
- Same login-free Evergreen app you already use (auth is off by decision).

---

## Wall between tickets and the client system

This is the key point you asked for: the AI must never touch this.

- Tickets have their OWN database table (`tickets`), not mixed with client data.
- Tickets are NOT added to `POST /api/search`, so the skill's search can never return them.
- Tickets are NOT written into `SKILL.md` and NOT in `GET /api/openapi`, so Aaman's Claude
  has no idea the endpoints exist.
- The ticket API routes live under `/api/tickets/*`, used only by the Tickets tab in the
  browser. The Evergreen data skill does not reference them.
- The daily Slack ingest for tickets reads ONLY the bugs channel `C0890LFFRAB`. It does not
  touch client Slack data, and client Slack sync does not touch tickets.

So: same app and database for your convenience, but a clean, separate room the AI cannot
walk into.

---

## How bugs get in (Slack ingest)

No AI is involved. Slack already gives the text, who posted it, the time, and a link back
to the message. We just copy each message in the bugs channel into a ticket. Every message
becomes one ticket. Dedup is on the Slack message id, so nothing is ever doubled. Join/leave
and bot noise messages are skipped. New tickets always arrive as Unchecked, assignee Hilal.

Reading is one-way: Slack into the board. Nothing is posted back to Slack.

It runs in TWO ways, and we do both:

### A. Real-time trigger (Slack Events API) — the instant one
- Slack PUSHES each new message in the bugs channel to an Evergreen endpoint the moment it
  is posted. A ticket appears right away. This is the "trigger based" way.
- Endpoint I build: `POST /api/slack/events`. It verifies the request is really from Slack
  (using the signing secret), answers Slack's one-time URL verification challenge, keeps
  only messages from channel `C0890LFFRAB`, and inserts a ticket.
- Who sets up the Slack side (2 minutes, only you can — it is your Slack app admin):
  1. api.slack.com/apps -> your app -> **Event Subscriptions** -> turn ON.
  2. Request URL: `https://knowledgebase-production-f52e.up.railway.app/api/slack/events`
     (Slack will call it once to verify; my endpoint answers automatically).
  3. Subscribe to bot event **`message.channels`** -> Save.
  4. Reinstall the app if Slack asks.
  5. Add **`SLACK_SIGNING_SECRET`** (from the app's Basic Information page) to Railway.
- The bot must be in the channel: it auto-joins (public channel), or `/invite @evergreen`.

### B. Daily poll + "Sync bugs now" button — the safety net
- The daily sync also reads the bugs channel and fills in anything the trigger missed
  (for example if Railway was restarting when a message arrived).
- A "Sync bugs now" button on the Tickets tab pulls the latest on demand.
- Zero setup: uses the bot token already connected.

Result: the poll and button work the moment I build this (no setup). The real-time trigger
switches on when you finish the 2-minute Slack config. Between the two, nothing is missed.

---

## Data model (so you can see it is simple)

One main table, plus a tiny list for assignee names.

`tickets`
- id
- slack_ts (unique)      -> the Slack message id, used for dedup
- slack_channel_id       -> C0890LFFRAB
- reporter               -> Slack user who posted
- permalink              -> link back to the Slack message
- text                   -> the bug message
- status                 -> unchecked | in_progress | complete (default unchecked)
- assignee               -> default 'Hilal'
- day                    -> the date the bug came in (for the daily board grouping)
- created_at, updated_at, resolved_at

`ticket_assignees`
- name (Hilal, Saqlain, Himanshi, Muqtadir, + any you add)

That is all. No embeddings, no AI, no vectors. It is a plain board.

---

## What I will build (files)

Backend (plain scripts, no AI):
- `agents/tickets_sync.py` -> read `C0890LFFRAB`, upsert tickets (dedup on slack_ts).
  Used by the daily poll and the "Sync bugs now" button.
- Add a tickets step to `agents/daily_sync.py` (separate from client Slack sync).
- Slack: add a `permalink` helper to `agents/connections/slack.py`.
- Real-time endpoint: `frontend/app/api/slack/events/route.ts` -> verifies Slack's
  signature (needs `SLACK_SIGNING_SECRET`), answers the URL challenge, inserts a ticket
  for each new message in `C0890LFFRAB`.

Database:
- `tickets` table + `ticket_assignees` table (seeded with the 4 names).

Frontend (Evergreen app):
- `frontend/app/tickets/page.tsx` -> the Tickets page with Daily and All-time views.
- `frontend/components/TicketBoard.tsx` -> the 3-column board, cards, assignee dropdown,
  move-between-columns, pagination.
- `frontend/app/api/tickets/route.ts` -> list (with day filter, status filter, assignee
  filter, pagination), update (status / assignee), and a "sync now" trigger.
- `frontend/app/api/tickets/assignees/route.ts` -> list / add assignee names.
- Add the **Tickets** link to the top nav in `frontend/app/layout.tsx`.

None of these are added to the skill, search, or openapi. The AI stays blind to it.

---

## Not in this build (can add later if you want)

- Turning Slack thread replies into ticket comments/notes.
- Tags/priority (low/medium/high) on a ticket.
- A weekly "what got cleared this week" summary posted back to Slack.
- Email/Slack reminder if a ticket sits in Unchecked too long.

---

## Decisions (confirmed with Hilal)

1. Every message in the bugs channel becomes a ticket. (Not only tagged ones.)
2. All-time view: ~30 cards per page.
3. Delete button on each card: yes.
4. Ingest: real-time Slack Events trigger + daily poll + manual button (both). No AI.
5. Slack setup for the trigger (Event Subscriptions + `SLACK_SIGNING_SECRET`) is done by
   Hilal; the endpoint and everything else is built by me.
