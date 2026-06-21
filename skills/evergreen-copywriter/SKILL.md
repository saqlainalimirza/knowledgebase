---
name: evergreen-copywriter
description: "Write cold-outreach SMS/email copy grounded in Scaletopia's Evergreen memory. Use whenever writing or improving copy for a client/campaign. Pulls real pains, buyer lingo, tiered proof, and proven winning copy from the Evergreen API — from multiple angles, with a controllable amount — then writes, then saves the copy and links it to its campaign. Triggers on 'write copy for', 'sms for {client}', 'improve this copy', 'what works for {niche}', 'brief me on {client}'."
---

# Evergreen Copywriter

You write outbound copy that is *grounded in data*, not guessed. Before writing, you
pull evidence from the Evergreen API along several angles; you control how much with
`limit`. Then you write, save, and link the copy.

**Base URL (live):** `https://knowledgebase-production-f52e.up.railway.app`
Full machine-readable contract: **GET `/api/openapi`**. All bodies are JSON.
Always call the live base URL above; every path below is relative to it
(e.g. `POST https://knowledgebase-production-f52e.up.railway.app/api/search`).

## The angles (each is one endpoint call)

| Angle | Call | Ranked by | Use it for |
|---|---|---|---|
| **Pains / objections / dreams** | `POST /api/search` `{type:"pains", route:true, query}` | similarity; prefer `confidence:"confirmed"` | the wound to open with, objections to disarm |
| **Buyer lingo** | `POST /api/search` `{type:"pains", query:"<topic>"}` then keep `kind=="lingo"` | similarity | their exact words → sound native |
| **Proof** | `POST /api/search` `{type:"case_studies", query}` | **tier S→A→B** | the result line + unique mechanism |
| **Proven winners** | `POST /api/search` `{type:"copies", status:"winner", query}` | **positive_rate** (real) | what already converted — mimic the lever/structure |
| **Winning hooks/CTAs** | `POST /api/search` `{type:"components", query}` | verdict=winner | swipeable openers, CTAs |
| **Dominant niche pains** | `POST /api/clusters` `{niche}` | **client_count** (how many clients hit it) | the pain to lead with for a *new* client in the niche |
| **Niche brain + lingo** | `GET /api/clients/{slug}` → `niche.commonalities_summary`, `niche.shared_lingo` | pooled | fast orientation |
| **Who/what + performance** | `GET /api/clients/{slug}/stats` | live Airtable | persona, channel, what's working now |

## The amount dial (more / less / medium)

Pass `limit` per call. Suggested presets:
- **less** (tight, ~1 screen): pains 3, case_studies 1, copies 2, components 3
- **medium** (default): pains 6, case_studies 2, copies 3, components 5
- **more** (deep): pains 10, case_studies 3, copies 5, components 8, plus `clusters`

`route:true` keeps it efficient — the query is matched to the right niche first, so you
only pull relevant rows (not the whole DB). Omit `route` and pass `niche` to pin it.

## Recipe — write one piece of copy

You can fire these in parallel; they're independent reads.

1. **Orient**: `GET /api/clients/{slug}` and `/stats` → niche, offer, persona, channel (sms/email), what's live.
2. **Pains** (lead angle): `POST /api/search {type:"pains", route:true, query:"<the angle, e.g. rising CAC on Meta>", limit:<preset>}`. Keep `confidence:"confirmed"` first.
3. **Proof**: `POST /api/search {type:"case_studies", query:"<result you want to claim>", limit}` → take the highest `tier`. Use its `after_state` + `unique_mechanism`.
4. **Winners**: `POST /api/search {type:"copies", status:"winner", query:"<angle>", limit}` → study the top `positive_rate` ones; reuse the lever/pattern, don't copy verbatim.
5. **Hooks/CTAs**: `POST /api/search {type:"components", query:"opener|cta", limit}`.
6. **(new client / niche-level)**: `POST /api/clusters {niche}` → lead with the highest `client_count` pain; pull `shared_lingo` from the niche brain.
7. **Write** the copy using: confirmed pain → disarm objection → proof line (mechanism) → soft CTA, in the buyer's lingo, within SMS length.
8. **Save**: `POST /api/agents/save-copy {client_slug, t1, t2, lever, persona, status:"draft", components:[...6 parts...], campaignId?}`. Char counts + embeddings are computed for you.
9. **Link** (if not linked at save): `POST /api/copy/link {copyId, campaignId}`.

## Reading the signals (trust order)

- **confirmed > needs_more** (pain confidence) — confirmed is verified, needs_more is a transcript guess.
- **tier S > A > B** (case studies) — only S/A/B make it into outreach; skip C/D.
- **positive_rate** (copies) — the ONLY real winner signal; weight by it, not by `status` alone.
- **client_count** (pain clusters) — a pain hit by many clients is a safer lead than a one-off.
- **score** on every search row = cosine similarity (0–1); >0.75 is strong, <0.6 is weak.

## Efficiency notes

- Batch the angle calls concurrently — they don't depend on each other.
- Use `route:true` + a small `limit` first; only go `more` if the copy needs depth.
- `components` search gives you swipeable parts without pulling whole copies.
- Everything is embedding-ranked, so a small `limit` already returns the *best* few, not random ones.

## Hard rules

- Never invent metrics or proof — only use what the case-study/pain rows return.
- Match `channel` (sms vs email) from stats; respect SMS length.
- Save copy as `draft` unless you have real results; winners are decided by `positive_rate`, not by you.
