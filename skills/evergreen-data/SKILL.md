---
name: evergreen-data
description: "Data supply for copywriting: pull real pains, buyer lingo, tiered proof, winning/losing copy, and niche intelligence from Scaletopia's Evergreen API. This skill does NOT write copy and does not impose a copywriting method. Your own playbook decides how to write; this skill tells you how to fetch the evidence and how to read its quality signals, and how to save a finished copy back. Triggers on 'get data for', 'brief me on {client}', 'what works for {niche}', 'pull pains/proof/winners', or any copy task that needs Evergreen evidence."
---

# Evergreen Data Supply

Your copywriting method comes from YOUR playbook. This skill only covers three things:
1. how to **fetch** evidence from the Evergreen API,
2. how to **read the quality signals** on what comes back,
3. how to **save** a finished copy into the system.

**Base URL (live):** `https://knowledgebase-production-f52e.up.railway.app`
Machine-readable contract: `GET /api/openapi`. All bodies JSON. Fire independent calls in parallel.

## The data angles (each is one endpoint call)

| Angle | Call | Returns |
|---|---|---|
| Client overview | `GET /api/clients/{slug}` | offer, niche, pains, case studies, calls, niche brain summary + shared lingo |
| Live performance | `GET /api/clients/{slug}/stats` | real Airtable numbers: sent, replies, meetings, per campaign |
| Pains / lingo / dreams / objections | `POST /api/search {type:"pains", route:true, query, limit}` | buyer quotes with `kind`, `confidence`, `persona` |
| Proof | `POST /api/search {type:"case_studies", query, limit}` | before/after, `tier`, `unique_mechanism` |
| Past copies (winners + losers) | `POST /api/search {type:"copies", query, limit}` | full anatomy: `t1/t2`, `lever`, `pattern`, `sophistication`, `unique_mechanism`, `pattern_interrupt`, `cta`, `why_it_worked`, `why_it_failed`, `weight`, `aged` |
| Copy parts | `POST /api/search {type:"components", query, limit}` | individual hooks/CTAs/mechanism lines with verdicts |
| Niche-wide dominant pains | `POST /api/clusters {niche}` | pain groups with `client_count` (how many clients share it) |
| Canonical niche list | `GET /api/niches` | niche/sub-niche ids for exact filtering (`nicheId`, `subNicheId` in search) |

Scoping: `route:true` auto-matches the query to the best niche. Or pin exactly with
`niche` (text) or `nicheId`/`subNicheId` (canonical ids). Cross-client pooling happens
automatically inside a niche.

## Amount dial

`limit` controls volume. Everything is ranked, so small limits return the best few, not
random ones. Suggested: light = 2–3 per angle, standard = 5–6, deep = 8–10 plus `/api/clusters`.

## Quality signals (how to read what comes back)

- `confidence` on pains: `confirmed` is verified; `needs_more` is an AI guess from a transcript.
- `tier` on case studies: S strongest → D weakest.
- `weight` on copies: composite of relevance × performance × recency. Performance is
  results **per send**, sample-adjusted (10 meetings on 5,000 sends scores below 5 on 200).
  Known losers sink. Ranked for you; higher = more trustworthy.
- `aged: true` on a copy: old. Its lesson may hold; its phrasing/offer may not.
- `why_it_worked` / `why_it_failed` on copies: the stored analysis of each winner/loser.
  This is the richest field in the system; read it, don't just skim t1/t2.
- `client_count` on clusters: pains raised by multiple clients are validated, not one-off.
- `score` everywhere: cosine similarity 0–1 (>0.75 strong, <0.6 weak).

What you do with these signals is your playbook's business.

## Saving a finished copy back

- Save: `POST /api/agents/save-copy {client_slug, t1, t2, lever?, persona?, status:"draft", components?, campaignId?}`.
  Char counts + embeddings are computed server-side. Save as `draft`; winner/loser status
  comes from real metrics later, not from the writer.
- Link to a campaign (then or later): `POST /api/copy/link {copyId, campaignId}`.
  Campaign ids come from `GET /api/clients/{slug}/copies`.

## Data integrity rules

- Never invent metrics, results, or proof; only cite what the API returned.
- Don't hand-write to the DB; only the endpoints above.
