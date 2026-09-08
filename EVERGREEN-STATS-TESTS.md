# Evergreen Stats — 50-question test suite

Run each prompt against Claude with the **evergreen-stats** skill loaded. Every prompt is
written to force a **one-line answer** so you can grade fast. The italic *✓ correct if* line
is the grading key: it names the source/definition a right answer must use (not a fixed
number, since the data is live).

**Paste this instruction once at the top of your test chat:**
> For every question I ask, answer in ONE line: the number first, then the window and channel
> you used. No breakdowns unless I ask.

**Definitions to grade against (these are the agreed rules):**
- **Sent for a window** = messages from the ops daily feed (`/period` or `/api/clients/{slug}/period`), NOT campaigns.sent and NOT an Airtable rollup.
- **PR = positive reply = every deal.** A deal is a PR. Power request is a *separate, narrower* sub-count.
- **Meetings booked** = `meeting_booked_at` (the event), not current stage.
- **Agency-wide** ("we"/"total", no client named) → `/api/period`. **Named client** → `/api/clients/{slug}/period`.
- **sent counts messages** in the daily feed; campaign lifetime `sent` counts leads (~2 texts/lead on SMS).

---

## A. Agency-wide sends (the ones that broke before)

1. How many SMS did we send last week? — *✓ agency `/api/period?window=last_week&channel=sms`; states Mon–Sun window.*
2. How many emails did we send last week? — *✓ same endpoint, channel=email; must NOT say "SMS only".*
3. How many SMS did we send this week so far? — *✓ window=this_week; says it is partial / data_through.*
4. How many total messages did we send this month? — *✓ this_month, SMS+email summed.*
5. How many SMS did we send last month? — *✓ last_month, full calendar month.*
6. How many SMS did we send yesterday? — *✓ window=yesterday; if feed lags, says today/yesterday not fully in yet.*
7. Did we send more SMS this week or last week? — *✓ two period calls compared, both numbers given.*
8. What's our SMS send volume over the last 7 days? — *✓ window=last_7d.*

## B. Client sends + positive-per-SMS

9. How many SMS did leadgenix send last week? — *✓ `/api/clients/leadgenix/period?window=last_week&channel=sms` (~1,263).*
10. What's leadgenix's positive-per-SMS last week? — *✓ PRs ÷ daily-feed messages, not ÷ leads.*
11. How many emails did scaletopia send this month? — *✓ client period, channel=email.*
12. How many SMS did kynship send last month? — *✓ client period, last_month.*
13. What's chamber_media's SMS volume this week? — *✓ client period, this_week, partial noted.*
14. Positive-per-SMS for dma last week? — *✓ client period; small sample flagged if thin.*

## C. PRs (positive replies)

15. How many PRs did we get last week? — *✓ agency, deal-based; every deal counts.*
16. How many SMS PRs did leadgenix get last week? — *✓ client, channel=sms.*
17. How many positive replies did scaletopia get this month? — *✓ client, this_month.*
18. How many power requests did chamber_media get last week? — *✓ power_requests, NOT reported as PRs.*
19. What's the difference between our PRs and power requests last week? — *✓ explains PR = all deals, power = sub-count.*
20. How many PRs did big_leap get this month? — *✓ client this_month.*
21. Which client got the most PRs last week? — *✓ agency `?by=client`, sorted.*

## D. Meetings booked

22. How many meetings did we book last week? — *✓ agency, meeting_booked_at event (not stage).*
23. How many meetings did kynship book this month? — *✓ client this_month.*
24. How many SMS meetings did we book last week? — *✓ channel=sms; says "SMS only".*
25. How many meetings has scaletopia booked all-time? — *✓ meeting_booked_at count; not a stage count.*
26. Did booking a meeting drop out of the count once it moves to "show"? — *✓ NO — meeting_booked_at persists.*

## E. Campaign-level

27. How is the ICP Hook Enriched campaign doing for scaletopia? — *✓ `/report`, that campaign row (sent, PRs, power, booked).*
28. Is scaletopia's ICP Hook Enriched still worth running? — *✓ checks status; if completed, says so.*
29. What's the reply rate on Big Leap's 7 Variants campaign? — *✓ email reply_rate_pct (replies ÷ sent); replies ≠ PRs.*
30. What's the bounce rate on Big Leap's 7 Variants? — *✓ bounce_rate_pct (54 bounces / 7,681).*
31. Which SMS campaign has the best PR rate for dma? — *✓ report/copy-performance, real volume.*
32. How many deals did the DMA HVAC campaign generate? — *✓ report campaign row PRs.*
33. Show me scaletopia's active SMS campaigns. — *✓ report/stats activeCampaigns, status ACTIVE.*
34. What's the live copy running on leadgenix's top campaign? — *✓ report live_copy (reconstructed).*

## F. Variant / CTA

35. Which variant won inside scaletopia's ICP Hook Enriched? — *✓ variant-performance; if reach thin, says "not enough reach".*
36. Which CTA is working best in ICP Hook Enriched? — *✓ CTA-level, directional caveat.*
37. Which copy performed better for kynship? — *✓ copy-performance per (campaign, variant).*
38. Did variant V1 or V4 win for scaletopia's ICP Hook? — *✓ names the winner only if reach supports it.*

## G. Benchmarks

39. Is chamber_media's SMS positive rate good or bad vs its niche? — *✓ benchmarks: client vs niche vs overall.*
40. How does dma compare to the rest of the book on positive rate? — *✓ benchmarks overall ratio.*
41. Is 0.4% positive-per-SMS good for us? — *✓ compares to book/niche, not stated in a vacuum.*

## H. Monthly trend

42. What's scaletopia's PR-per-SMS by month this year? — *✓ `/monthly`, one call, per-month rate.*
43. Which month was scaletopia's SMS peak? — *✓ monthly peaks block.*
44. Was summer slow for scaletopia SMS? — *✓ reads Jun/Jul/Aug months, honest read.*
45. How did leadgenix's PRs trend over the last 6 months? — *✓ monthly?months=6.*

## I. Churn

46. Which clients have churned? — *✓ `/api/churn`, Churned vs Paused, with dates.*
47. Which churned client was drying up before they left? — *✓ churn trend = drying_up.*
48. How long did velox stay before churning? — *✓ tenure_months from churn cohort.*

## J. Edge cases / definitions (these catch the classic mistakes)

49. When you say "sent", is that texts or leads? — *✓ daily-feed period sent = messages; campaign lifetime sent = leads (~2 texts/lead).*
50. How fresh is the send data — does it include today? — *✓ names data_through; today may not be fully counted.*

---

### How to grade
- **Number-first, one line, states window + channel** → format pass.
- **Uses the right source** (daily feed for sent, deals for PRs/meetings, meeting_booked_at for booked, `/period` not arithmetic) → correctness pass.
- **Honest caveats** (partial week, thin reach, completed campaign, feed lag) → judgment pass.

A wrong answer usually means one of: derived a window by subtracting rollups, used campaigns.sent for a period, reported power_requests as PRs, counted booked by stage, or claimed the un-queried channel was zero.
