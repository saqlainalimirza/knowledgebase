# Evergreen meeting fixes — action plan (2026-08-30)

The eight issues from the review, each mapped to a concrete fix and status.

## Data accuracy (the "wrong numbers" cluster)

### 1. PR counts inaccurate (duplicates / negatives counted as positive) — FIXED
- Definition (confirmed with Hilal): **PR = Positive Reply**, and a deal IS a positive reply,
  so **PR for a campaign = the total number of deals for it** (meeting-booked deals included).
- Root cause: the reported "PR" was `power_requests`, which lumped {power request, positive,
  meeting booked} and was mislabeled as PR; and a handful of mis-tagged hard-negatives
  (threat / wrong number / not interested / retired ~11 total) sat in Deals.
- Fix shipped: `positive_replies` (PR) = count of ALL deals for the campaign EXCEPT those
  hard-negatives; `power_requests` = ONLY the 'power request' sub-category (kept separate,
  correctly labelled); `booked` = meeting booked / show / won. (ICP Hook Enriched PR = 25.)
- Duplicate side already fixed earlier: `campaign_rollup` collapses same-name campaign rows
  so totals aren't Nx inflated.

### 2. Stats came from semantic search, not clean categories — DONE
- All stat/report endpoints (`/stats`, `/report`, `/replies`, `/copy-performance`,
  `/variant-performance`) read clean categories directly, never `POST /api/search`.
- To add: a HARD skill rule — never use `/api/search` for a count or a stat; it is for
  finding text by meaning only.

### 7. Campaign / CTA / variant analysis could be wrong — MOSTLY DONE
- Fed by #1 (clean counts) + the dedupe rollup + variant reach-floor (collapses noise,
  says "not enough reach" instead of inventing a winner).
- To add: keep the confidence caveat visible in every analysis answer.

## Behaviour (the "slow / verbose / wrong pull" cluster)

### 3. Claude too slow (deep research for simple questions) — DONE, reinforce
- The COMMON QUESTIONS -> ONE CALL table maps each question to one endpoint.
- To add: rule — for a stat/lookup question, make the one mapped call and answer; do NOT
  explore the graph or scan raw deals.

### 4. Ambiguous prompts pull the wrong window (all-time vs day/week) — TO DO
- Add explicit date-range params where missing (`?since=`, `?weeks=`, day granularity) and
  a skill rule: always pin client + date range, default to the window asked, and STATE the
  window used in the answer ("this week:", "yesterday:").

### 5. Too much information returned — TO DO (skill rule)
- Rule: answer the exact question first, in 1-3 lines with the number, then offer detail.
  No dumping full objects.

### 8. Needs more context to answer (client, campaign, SMS vs email, date) — TO DO (skill rule)
- Rule: a stat question needs client + (campaign if named) + channel + date range. If any
  is missing and matters, assume the most likely and STATE the assumption, or ask one short
  question — never guess silently.

## Structure (the root cause of 3/5/6/7)

### 6. One giant skill doing everything — TO DO (biggest lever)
- Split the single skill into two focused ones so Claude knows its job:
  - **evergreen-stats** — numbers, reporting, PR/positive/booked, campaign/CTA/variant
    performance. Strict rules: clean categories only, one call, concise, state the window.
  - **evergreen-copy** — writing + research (winners, pains, materials, guidelines, save-copy).
- Shared data hierarchy + client directory referenced by both.
- This single change carries #3, #5, #6, and most of #7: a stats-only skill with hard rules
  answers numbers fast, short, and correct, and can't wander into copywriting mode.

## Order of work
1. [DONE] PR/positive accuracy (#1) + clean-category sourcing (#2) + dedupe (#7).
2. Split the skill into evergreen-stats / evergreen-copy (#6) — carries #3/#5/#7.
3. Bake the rules into the stats skill: one call, concise, state the window, require context
   (#3/#4/#5/#8).
4. Add the missing date-range params to endpoints (#4).
