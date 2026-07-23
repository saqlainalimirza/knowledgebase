# Evergreen Plan (from Aaman meeting, July 20)

Base verdict from the call: "the base is done." Development of the core system is complete.
What is left is the improvement loop, connections, and process. This file is the working
plan, ordered by priority. Check items off as they ship.

---

## P1. Copy Guidelines memory (the missing learning loop) — ~1 day

**Problem:** Claude has no memory between sessions. Aaman dials in a great copy with
back-and-forth, opens a new session, and all of that taste and instruction is gone.
Every copy session feels different, output is unpredictable.

**Build:**
- [x] New table `guidelines` (generalized: any kind of guidance, global or per-client): client_slug (nullable = global), guideline_text,
      context (what copy/session it came from), created_at, source (who saved it), embedding.
- [x] API: `POST/GET/PATCH /api/guidelines`, included in `GET /api/clients/{slug}`, `guidelines` search type, frontend tab.
- [x] Skill update: one-line prompt flow. Aaman says "save what I liked into Evergreen"
      and Claude writes the guidelines through the endpoint. When writing copy, Claude
      pulls the client's guidelines first.
- [x] Date-aware: keep all versions, newest first, so taste evolution per client is visible
      ("one month ago Aaman liked X for Chamber, now he likes Y").

This closes the loop: data rules exist, copy rules per client now persist too.
Playbook stays in Claude; guidelines are the per-client adaptation layer.

## P2. Contacts table into Evergreen + data hierarchy — kill the MCP confusion

**Problem:** Claude gets stuck choosing between Evergreen, Airtable MCP, and GHL MCP.
It over-fetches (12,000 messages pulled when 2,000 were sent last week), burns API
credits, and can knock over Airtable/GHL that our automations depend on.

**Build:**
- [ ] Sync the Airtable Contacts table into Evergreen (all reply types with categories:
      positive, negative, custom response, blocklist, etc.), joined to campaigns/clients.
- [ ] Endpoint(s) to query replies by category / campaign / week.
- [ ] Skill hierarchy section, explicit routing rules:
      1. Positive replies and outcomes -> Evergreen deals
      2. All replies / reply categories -> Evergreen contacts
      3. Overall stats -> Evergreen client stats
      GHL/Airtable MCP: only for what Evergreen does not have. Never bulk-pull from them.

## P3. All copies interconnected (not just winners)  ✅ DONE

**Problem:** Chamber Media has tons of data but the copy logs are not in the system,
only curated winners/losers. Copies should flow in automatically.

**Build:**
- [x] Copies mined from deal conversations (204 copies auto-linked to campaign+variant
      with real stats). Plus the launch-time flow: when copy is prepared in Claude Code, it saves through
      `POST /api/agents/save-copy` with the campaign name, and Evergreen links it to the
      campaign automatically. No Airtable logging, no manual linking, stats flow in on
      their own via the daily sync. (Endpoint exists; make the skill push this flow hard.)
- [ ] Backfill: keep asking Aaman/Khizar for campaign names of the 17 unlinked winners
      and 8 losers; auto-link as names arrive.

## P4. Process memory (consistent inputs, GTM run protocol)

**Problem:** Point A (strategist) to point Z (8/10 copy) goes a different route every
time. Aaman is locking in consistent inputs; that process should live in Evergreen so
it is done once and reused, not re-invented per session.

**Build:**
- [ ] Store the run protocol / input checklist in Evergreen (fits inside
      `copy_guidelines` with a `kind` field, e.g. kind = 'process' vs 'preference').
- [ ] Skill instructs Claude to fetch the process doc at the start of any copy task.

## P5. Churn-proofing + sales calls

- [x] Churn section: mark a client churned (status 'past') from the Lifecycle tab; all
      data stays in Evergreen as reference (downweighted), live syncs stop. Reactivate any time.
- [ ] Sales-call transcripts ingestion (our own sales calls, not client GTM calls):
      new source type; Aaman will send recordings/transcripts. Reuse transcript agent
      with a `call_type='sales'` tag.

## P6. Khizar's clients

- [ ] Mostly loaded already (copies added July 20). Add the remaining one(s) discussed
      on the call (name to confirm with Khizar) with the standard onboarding flow.

## P7. Send Aaman the updated skill

- [ ] After P1/P2 ship, update `skills/evergreen-data/SKILL.md` (guidelines endpoints,
      contacts hierarchy, launch-time save-copy flow) and send it to Aaman. He points
      Claude at only this skill.

---

# Outside Evergreen (separate projects, on my plate)

- [ ] **Positive-reply channels** (Kylie/ClickUp task): one Slack channel per client,
      auto-post each positive reply with a screenshot of the conversation in the thread.
      Clients feel the activity. Quick build; sync details with Kylie.
- [ ] **Ticketing system**: Slack tag in bugs-and-troubleshoot -> auto-create a ticket in
      a frontend board. Visible to anyone (what Hilal is working on, done/not done).
      Goal: same-day acknowledgement, nothing missed. Client offered to build it;
      decide who builds after talking to him. Root cause to also attack: GHL variable
      mapping errors at campaign launch (meeting with Saqlain about it).
- [ ] **Client stats CRM**: automate onboarding so new clients' stats flow in without
      manual setup.
- [ ] **Email skill**: after SMS side is polished; EmailBison/GHL can supply copies with
      campaigns attached.

# Aaman's side (waiting on)

- Stress-test Evergreen with plan mode, lock consistent inputs, and ask Claude directly
  "where is Evergreen weak" — bring the list to the Wednesday/Thursday call.
- Kylie to brief the positive-reply channel spec.
- Campaign names for unlinked winners/losers; L9-L19 loser fills.
- Sales call recordings for P5.

# Notes

- Developers: week 4 is their last build week, weeks 5-6 are testing; payment sorted on
  the 29th as usual.
- Slack ingestion shipped July 20 (14 channels, 2,533 messages, in the daily sync).
- Deals tab on the frontend shipped July 20 (shows exactly what the AI sees).
