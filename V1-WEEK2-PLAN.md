# V1 — Week 2 Plan (Copy + Metrics Loop)

Funnel order: Week 1 = knowledge foundation (done). **Week 2 = the copy layer** — copies
live in the DB with variants, real metrics attach to them from Airtable, and the
weighted ranking switches from "label-based" to "results-based." Everything extends the
live DB in place; no rebuild.

**Where Week 1 left us (relevant bits):**
- 28 real copies in (20 winners / 8 losers, components + embeddings), `campaign_id` NULL.
- Weighted ranking live, but the **performance factor runs on a prior** — `copy_metrics`
  is empty, so nothing ranks by actual results yet.
- Aaman is generating copies all week via the skill → a live feedback loop lands in our lap.

---

## 1. Objectives (Definition of Done)

By end of week:
1. **`copy_metrics` fills from Airtable** on a schedule/command — sent, positive replies,
   booked per campaign period — and attaches to the copies linked to those campaigns.
2. **Variants exist**: `variant` column on copies (A/B/C), multiple copies per campaign,
   variant picker in the copy editor + save-copy API.
3. **Performance ranking switches on**: `copy_performance` feeds the weighted search, so
   winners rank by real per-send rate (the prior only covers unmeasured copies).
4. **Backfilled copies linked** to campaigns where Aaman can name them (his input; the
   rest stay orphaned by design).
5. **Niche brains refreshed** — `winning_levers` finally populates (winners now exist).
6. **One skill-tuning pass** from Aaman's live testing feedback.

---

## 2. The metrics sync (core build of the week)

**Source of truth:** Airtable. Two levels available:
- **Relinked Campaigns** table — per campaign: Sent, Replies, PR Rate, Positive Replies,
  Meetings Booked, Booking Rate.
- **Daily SMS / Email Stats** — per client per day (finer time slices).

**Week-2 attribution model (honest about its limits):**
- Metrics are **campaign-level**. A copy linked to a campaign inherits that campaign's
  numbers for its period → written to `copy_metrics (copy_id, campaign_id, sent,
  positive_responses, booked_calls, period)`.
- If a campaign ran multiple variants, all its copies share the campaign numbers this
  week. **True per-variant split arrives in Week 3** via the Deals table (`Copy Variant
  (from Contacts)` tells us which variant drove each reply/meeting).
- Sync is idempotent (upsert on campaign+period), runnable manually or on cron.

**Why this order:** rate-based ranking needs *any* real denominator now; per-variant
precision is a refinement, not a blocker.

---

## 3. Variants

- Add `variant` (text: A/B/C…) to `copies`; default `A`.
- Copy editor: variant picker next to the campaign dropdown; the copies list groups by
  campaign and shows variants side by side.
- `save-copy` API + skill accept `variant`, so generated copy saves as the right variant.

---

## 4. The feedback loop with Aaman (runs all week, no build needed)

- He writes copy via the skill → saves as `draft` → links campaign in the UI.
- His "improved or went bad" verdicts + examples → one **skill tuning pass** end of week
  (prompt fixes, retrieval depth, which angles get pulled).
- His campaign names for the 28 backfilled copies → link pass (10 min).

## 5. Quick wins (do early, cheap)

- **Re-run niche synthesis** for DTC ecom / Local / Professional — `winning_levers` will
  populate for the first time since winners exist now.
- Copy page: show each copy's metrics + computed rate once sync lands (read from
  `copy_performance`).

---

## 6. Day-by-day

| Day | Build | Also |
|---|---|---|
| Mon | Metrics sync agent v1 (Relinked Campaigns → copy_metrics) | niche-synth re-run (winning_levers) |
| Tue | Variant column + editor + API | link backfilled copies (Aaman's names) |
| Wed | Wire copy_performance into weighted search; verify rates rank correctly | copy page shows metrics |
| Thu | Daily-stats granularity in sync (periods); cron/manual trigger | collect Aaman's testing notes |
| Fri | Skill tuning pass from feedback; QA + demo | weekly review call |

## 7. Not this week (by design)
- Per-variant attribution + contacts/job titles → **Week 3 (Deals sync)**.
- Dashboard V1 redesign → Week 4. Email skill → Week 5.

## 8. Risks
| Risk | Mitigation |
|---|---|
| Campaign-level metrics mis-credit multi-variant campaigns | Documented; per-variant split lands Wk3 via Deals |
| Backfilled copies stay orphaned (no campaign names) | They still power search by weight; metrics just won't attach — acceptable |
| Airtable field drift (Relinked Campaigns is messy) | Sync reads a fixed field map; unknown fields ignored + logged |
