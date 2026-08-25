Evergreen API gaps — two traces for the automation engineer
2026-08-25. Two questions that should each be one API call and a few seconds. One took 6 round-trips, the other ~20. Below is exactly what was run, what failed, and the smallest change that would fix each.

Honest split up front: of the second trace, roughly half the cost was a stale config on our side (we were querying a dead GHL sub-account) and one analysis error was mine (detailed in §2.4). The rest is API surface.

1 · “What are Scaletopia’s BD / biz-dev SMS campaigns, with copy and stats?”
What was actually run
#	Call	Result
1	GET /api/clients/scaletopia	197 campaigns, unfiltered — no way to ask for “BD” or for channel=sms
2	client-side filter in Python	CRASHED — power_rate came back as a string, f"{x:.3f}" raised ValueError
3	re-run with numeric coercion	11 BD matches, of which 5 SMS — but 4 were duplicate rows of one campaign
4	GET /api/clients/scaletopia/report	the reconstructed live_copy (this part worked well)
5	GET /api/clients/scaletopia/copies	137 copies, filtered client-side again
6	GET /api/clients/scaletopia/deals?channel=sms&limit=500	278 SMS deals, 0 matched BD/Sniper by campaign_name
7	curl … -o file then parse	truncated JSON (Unterminated string) — had to redo
8	POST /api/clients/{slug}/reply-diagnosis {"campaign":"BD Agencies"}	worked well, gave the qualitative read
The five defects
1.1 — Duplicate campaign rows (worst one). Sniper Campaign returns as 5 rows sharing one ext_id; ICP Hook Enriched returns as 46 rows. Every duplicate carries the same positives/power figure, and most have sent: 0.

id=804 sent=114 pos=1 booked=1     <- the real row
id=805 sent=0   pos=1 booked=1     <- duplicate
id=806 sent=0   pos=1 booked=1     <- duplicate
…
ICP Hook Enriched: 46 rows x pos=24  ->  naive SUM = 1,104 positives (true value: 24)
Any consumer that sums gets a number 46× too big. → Dedupe on ext_id, or expose GET /api/campaigns?dedupe=true.

1.2 — Numeric fields arrive as strings. power_rate, and inconsistently sent/positive_replies. → Return JSON numbers, or document the type. This crashes naive consumers on first contact.

1.3 — No server-side filtering on the campaign list. No ?q=, ?name_contains=, ?channel=, ?status=. Pulling all 197 and filtering client-side is the only option. → Add ?channel= and ?q= to /api/clients/{slug} campaigns.

1.4 — /deals doesn’t join to its own campaign names. 278 SMS deals returned; filtering campaign_name for bd|sniper|biz dev matched zero, despite those campaigns having recorded positives and bookings. The attribution exists in the campaign list but not in the deal rows. → Populate db_campaign_id consistently and let /deals?campaign_id= work.

1.5 — Large responses truncate. ?limit=500 on /deals returned malformed JSON when piped to a file. → Either cap and paginate properly with a cursor, or set Content-Length correctly.

What “good” looks like
GET /api/clients/scaletopia/campaigns?channel=sms&q=BD&dedupe=true
-> [{ id, name, sent, positives, power_requests, booked, live_copy:{t1,t2,variant} }]
One call. Currently: five calls plus client-side dedupe, type coercion and string matching.

2 · “Which CTA performed better?”
The two arms were could I show you how? (PLAIN) vs could I show u how? (on a performance basis) (PERF).

2.1 — Evergreen could not answer this at all
There is no CTA-level or copy-variant-level performance anywhere in the API. copy_variant exists on /deals but was A or null for every row in this campaign. The two CTAs ran inside one campaign under one tag, so every Evergreen view collapses them into a single number.

Everything below is work done because the API had no answer.

2.2 — The reconstruction that was actually required
#	Step	Cost
1	GET /conversations/messages/export (GHL), cursor-paginated 1,000/page, Aug 3–25	15,502 messages
2	POST /contacts/search, paginated 100/page, two date windows	8,044 contacts
3	join messages → contacts on contactId	in-memory
4	infer the CTA arm by regex on the message body ("on a performance basis" vs "could i show")	the only way to recover the variant
5	classify 190 inbound replies with a keyword classifier	see 2.4
6	hand-correct the classifier’s false positives	see 2.4
7	one 401 mid-pull → retry/backoff added	~1 min
8	scratchpad cleared between sessions → re-pulled 4,957 contacts	~2 min
The variant had to be recovered by string-matching copy text. That is the single highest-value fix on this page: if the send log carried copy_variant / cta_arm, steps 1–4 collapse into one query.

2.3 — Time also lost to a stale config (our fault, not the API’s)
We were querying GHL sub-account UqMcuYNiET94KiGWH5Ec, which stopped sending 2026-08-05. Sending had moved to TYVYHj7lX8bamHkOKz4s. That produced “7 texts this week” against Evergreen’s “1,600”, and burned ~8 round-trips proving Evergreen wrong before establishing Evergreen was right.

Evergreen was correct throughout. Two things would have prevented it:

/stats should state which locationId / sub-account it is reading. It currently reports numbers with no provenance, so there is no way to detect that the consumer is pointed elsewhere.
Document that sent counts leads, not messages (Scaletopia sends 2 texts per lead, so GHL outbound ≈ 2 × Evergreen sent). This mismatch looked like fabrication and wasn’t.
2.4 — The analysis error, which was mine
I gave the wrong answer first. I reported the two CTAs as statistically indistinguishable (“z≈1.1, not proven, PLAIN opts out more”), then later corrected to PLAIN being 3× more efficient.

The cause: I aggregated by calendar week (Aug 3 / Aug 10 / Aug 17). But the CTA split was not constant inside those buckets — there was a hard cutover on Aug 12, when PLAIN went from 45.7% of leads to 0%. So my “pooled” comparison mixed a period where both arms ran against a period where only one did. Textbook confounding: the aggregate said one thing, the day-level split said another.

cut	PLAIN	PERF	verdict
pooled by week (wrong)	2.94% reply	2.42% reply	“not proven”
head-to-head, Aug 6–11 only	6 pos / 1,734 leads = 1 per 289	2 pos / 1,727 = 1 per 863	PLAIN 3×
This is my error, not the API’s. But it is enabled by the API: had a variant-level endpoint existed, the comparison would have been served pre-segmented and the confound would have been impossible to introduce. Aggregations that hide a mid-period change are exactly what a variant-level time series prevents.

Also worth flagging: my reply classifier initially scored “Not I interested”, “Had to retire due to disability” and “How are you legally allowed to send me text messages” as positive (substring matches on “interested”, “retire”, “yes”). Corrected by hand. If Evergreen exposes reply categories per variant, nobody has to write this classifier again.

3 · Fix list, ranked by time saved
#	Fix	Unblocks
1	Store copy_variant / cta_arm on the send record, not just the campaign	Kills the entire §2.2 reconstruction
2	Dedupe campaign rows (one per ext_id)	Makes every campaign total trustworthy
3	Day-level series, not week-level, on weekly_trend	Would have surfaced the Aug 12 cutover immediately
4	Return numbers as numbers	Stops consumers crashing on first parse
5	?channel= / ?q= / ?since= on the campaign list	Turns 5 calls into 1
6	Fix the /deals → campaign join	Deal attribution by campaign becomes possible
7	State the locationId + “sent = leads” in /stats	Prevents the §2.3 wild-goose chase
8	Reply category per variant	Removes the hand-rolled classifier in §2.4
The one-line version
Evergreen answers “how is this campaign doing” well. It cannot answer “which variant inside a campaign is doing better” at all — and that is the question copy work always asks. Items 1 and 3 are the whole gap.

4 · Also worth telling the list-build side
Every one of the 8,044 leads carried the same tag: scaletopia - icp hook enriched | 20-500e | na. No vertical, no segment, no list-source field, and companyName populated on only 24%. So “did PR firms respond better than general agencies?” is permanently unanswerable for this send — not hard, impossible. Tag segment at list-build time.