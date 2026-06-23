# Scaletopia Evergreen — 6-Week Sprint (MVP → V1)

Plan to take the working MVP to a robust V1, based on the **June 22 review with Aaman**.
For the Monday kickoff with Jordan. Companion to [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md).

---

## Where we are (MVP — done & proven)

- One first-party DB (Supabase + pgvector); ingestion APIs handle transcripts, docs,
  CSVs, onboarding forms → chunk → embed → store. Deployed on Railway (live).
- 2 clients loaded (Chamber Media, Kynship), **cross-client by niche proven** — a
  Kynship copy run pulls Chamber Media's pains too (shared "agency on autopilot" etc.).
- Skill + OpenAPI so an AI writes grounded SMS copy from the data.
- Knowledge graph, semantic search, live Airtable stats, copy editor.

**The MVP did its job: surfaced the gaps below. V1 = rebuild cleaner + robust around them.**

---

## What Aaman asked for (feedback → captured)

| # | Feedback in the call | Sprint item |
|---|---|---|
| 1 | Skill was weak — needs to use the system data well | WS-E (skills) |
| 2 | No winning copies in the system; backfill **25 winning + 20 losing per client**; weekly fill routine | WS-C (copies) + Backfill |
| 3 | On upload, copy should pick **which campaign** it's for → auto-connect stats | WS-C |
| 4 | A campaign runs **multiple copy variants (A/B/C)**; need per-variant **attribution** | WS-C (variants) |
| 5 | "DTC ecom" too broad → want **niche + sub-niche** | WS-A (taxonomy) |
| 6 | Tag **job titles** (CMO/VP/CEO/founder/CRO…) + **employee range**; learn what each role says/KPIs across all of e-com | WS-A + WS-B |
| 7 | Connect **copy → campaign → deals → job titles** (+ conversations) so AI learns who converts | WS-B (deals graph) |
| 8 | Future: **inbox management** — "why are people saying no this week?" | WS-F (future-proofing) |
| 9 | Clients **without sales calls** (GoFish): add a **client-draft / research layer** Aaman fills; AI embeds + cross-links | WS-A (client_drafts) |
| 10 | Client page shows only a short summary — want **full context per client** | WS-D (dashboard) |
| 11 | Copy quality should hit the "rewrite" level **on first take** | WS-E (skills quality) |
| 12 | **Better tagging system** is the main DB need | WS-A |
| 13 | Email later — same as SMS once skills exist | WS-E (email skill) |
| 14 | SOPs + recorded Claude session for the strategist | WS-G (enablement) |
| 15 | Leads inventory — separate system, connect later | Out of scope (tracked) |

---

## Workstreams

- **WS-A — Data model & taxonomy (the backbone).** Redesign with proper tagging:
  `niche` + `sub_niche`, a `job_titles` dimension, `employee_range`, copy **variants**,
  and a `client_drafts` table for analyst-provided research (for clients with no calls).
  Robust enough to add inbox data later without breaking.
- **WS-B — Attribution graph.** copy → campaign(+variant) → deals → job title / employee
  range / conversations. Powers "who converts on what."
- **WS-C — Copies + stats loop.** Upload a copy, pick its campaign+variant, auto-link
  metrics; per-variant `positive_rate`; the dashboard fill flow for Khizar.
- **WS-D — Dashboard.** Full per-client context (calls, pains by kind, lingo/dream/
  belief, case studies, keywords, campaigns, real stats); better graph with the new tags.
- **WS-E — Skills.** Harden the SMS skill to first-take quality; clone it for **email**.
- **WS-F — Future-proofing.** Schema + API seams for inbox management / reply-reason
  analysis and the leads inventory (build later, design now).
- **WS-G — Enablement.** SOPs (fill data, add copies, use Claude Code) + recorded
  Claude session so a strategist can run a client.

---

## Week-by-week

| Week | Focus | Output |
|---|---|---|
| **0 (this week)** | Inputs + ideation | Aaman: Drive folders per client (transcripts, other info, **25 win / 20 lose copies + their campaign names**); Hilal: 3–4 day data-model ideation, onboard 2 engineers, Monday Jordan kickoff |
| **1** | **WS-A** schema redesign | New tagging model live: niche+sub_niche, job_titles, employee_range, copy variants, `client_drafts`; migration from MVP data |
| **2** | **WS-C** copies + attribution base | Copy upload → campaign+variant link → metrics auto-attach; per-variant positive_rate; backfill the supplied win/lose copies |
| **3** | **WS-B** deals + job-title graph | copy→campaign→deals→job title/employee range wired; graph + search filter by role |
| **4** | **WS-D** dashboard + graph V1 | Full per-client context pages; tag-aware graph; better stats |
| **5** | **WS-E** skills | SMS skill to first-take 7–8/10; **email skill** added; client_drafts feeding cross-links |
| **6** | **WS-G** + hardening | SOPs + recorded sessions; QA, robustness, future-proofing seams; V1 sign-off |

Cadence: **one update call/week** (Aaman reviews for *logical* gaps; engineering handles
technical). Final V1 review end of week 6.

---

## Backfill (data Aaman provides — Week 0)

A single Drive with **one folder per client**, each containing:
1. **Transcripts** (calls). Onboarding form — Hilal can pull from the sheet.
2. **Copies**: ~**25 winning + 20 losing** per client, and **which campaign each is tied to** (campaign name / variant).
3. Clients **without calls** (e.g. GoFish): Aaman's **brainstorm/research** doc (Reddit etc.) → goes into `client_drafts`.

Then a **weekly routine**: Khizar (and the new strategist) add new copies + outcomes via
the dashboard, so the winners pool stays current.

---

## New data-model additions (WS-A detail)

- `client_roster`: keep `niche`, **use `sub_niche`** properly; add default job-title focus.
- `master_sheet_pains` / case studies: carry `sub_niche` + optional `job_title`.
- `copies`: add `variant` (A/B/C); allow **many copies per campaign** distinguished by variant.
- **`copy_metrics`**: per copy/variant — sent, positive replies, booked (synced from Airtable Daily SMS/Email + Relinked Campaigns).
- **`deals`**: link campaign → deal → `job_title`, `employee_range`, (later) conversation.
- **`client_drafts`** (new): free-form analyst research per client → embedded → cross-linked to other clients' pains.
- A consistent **tagging** layer (niche / sub_niche / job_title / employee_range) used by search, graph, and the skills.

---

## Roles

- **Aaman** — Week-0 data (folders, copies+campaigns, drafts); weekly logical review; doing delivery in the interim; tests the system on real clients.
- **Hilal** — architecture, build lead, coordinates the 2 engineers, records Claude session, weekly updates.
- **2 AI engineers** — build WS-A→G to scope.
- **Khizar / new strategist** — ongoing copy + outcome entry via dashboard.
- **Jordan** — Monday kickoff / approval.

---

## Out of scope this sprint (designed-for, built later)

- Live **inbox-management** integration & reply-reason analysis (schema seams only).
- **Leads inventory** system connection.
- Automated/triggered skill runs.

---

## Success criteria (end of V1)

1. A strategist, using the skill + system, produces a **7–8/10 copy on the first take** in ~20 min.
2. **Per-variant attribution** works: a copy shows real `positive_rate` and the job titles/deals it drove.
3. **niche + sub-niche + job-title** filtering across all of e-commerce (cross-niche role insights).
4. Clients **without calls** are usable via `client_drafts`, cross-linked to the niche.
5. **Email skill** live on the same data.
6. New strategist can run a client from SOPs + the recorded session.

---

## Decisions to confirm Monday

1. Sub-niche taxonomy — fixed list or free text (recommend a controlled list + embedding-normalized).
2. Variant attribution granularity — per-variant only, or per-send-batch.
3. Backfill target realistic per client (25/20 ideal; "less but for all clients" acceptable per Aaman).
4. Rebuild-from-scratch vs. evolve-the-MVP DB (recommend clean rebuild with MVP data migrated — Week 1).
