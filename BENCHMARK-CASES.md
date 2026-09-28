# Benchmark Brief - Mechanism and Copy

**For:** Hilal
**From:** Aaman
**Date:** 2026-09-27
**Status:** STRAWMAN. Cases marked `[REDLINE]` are unconfirmed.

---

## The ask

16 test cases. 7 on mechanism, 9 on copy. That is the whole phase-1 deliverable.

The copy is the output that matters. Everything else in the system exists to produce it. So we test the
copy first, and when it fails we walk the trace backwards to find the stage that caused it. The upstream
test cases get written from real failures instead of guessed at in advance.

Do not build a harness for the parked categories in the appendix. They are there so the work is not lost,
not to be run yet.

---

## How to run one case

Each case has six lines.

```
ID · CATEGORY · GRADE TYPE
INPUT   what the system is given
RIGHT   the correct answer
WRONG   what has actually been seen (marked "seen"), or a plausible wrong answer (marked "plausible")
WHY     one line, so the fix is obvious
PASS    the exact rule that decides 1 or 0
```

Three grade types appear in phase 1.

| Type | How to grade | Needs GTM knowledge |
|---|---|---|
| `MCQ` | One listed option is correct. Compare strings. | No |
| `CONTAINS` | Output must contain, or must not contain, a named thing. | No |
| `JUDGE` | A yes/no question a human answers. The decision rule is written on the case. | Yes |

Phase 1 is 4 MCQ, 4 CONTAINS, 8 JUDGE. Half runs unsupervised. The JUDGE half needs Aaman until a judge
is aligned to him, which is a later job.

---

## The precondition (read this before anything else)

Before any case is scored, the trace must show that **the SMS skills actually fired** - sms-draft ran, the
voice profile loaded, the QA gate ran.

If they did not fire, the case is **void, not failed.**

This is not pedantry. On 2026-09-25 the YS Digital test produced mediocre copy and it looked like a copy
quality problem. It was not. Evergreen retrieval ran, then Claude wrote plain AI copy, because the prompt
never named a skill and skills do not self-activate. Scoring that as a copy failure would have sent us
chasing the wrong layer for a week.

So every result carries two fields, not one.

```
PIPELINE FIRED:  yes / no
SCORE:           1 / 0 / void
```

A run with a high void count is itself the finding, and the fix is routing, not copy.

---

## What I need back

For each case:

1. The output.
2. The trace. What it queried, what came back, which skill fired, in what order.
3. Your own technical read where you have one.

The trace matters more than the score. A case that passes for the wrong reason is worse than one that
fails, and only the trace shows the difference.

---

## Where the other categories come from

This is the part that replaces guessing.

When a copy or mechanism case fails, do not fix the copy layer. Walk the trace back and find the earliest
stage that made the failure inevitable. That stage gets a new test case, written from the real failure.

Worked example, from the DTCo run on 2026-09-21. A draft went out that was structurally identical to a
logged copy running 0.19% across 1,560 sends. As a copy failure it looks like bad judgment. The trace says
otherwise: the benchmark stage never ran. So the case that belongs in the set is not "write better copy",
it is "every variant must carry its nearest logged winner with rate and its nearest logged loser with
why_it_failed, before the strategist sees it."

One copy failure, one precise upstream case. That is how the rest of the set gets built, and it is why
there is no point writing 49 cases up front.

---

## Boundary

On mechanism and copy, Aaman's answer is ground truth and is not amended. Technical checks are yours to
add on top, not to override the answer.

---

## 1 - MECHANISM (7 cases)

```
M-01 · MECHANISM · JUDGE
INPUT   DTCo. Case studies BRUNT and ARMRA. Client website fetched. Name the mechanism.
RIGHT   Story-based creative builds a community, so customers keep buying after the spend stops. Agency-performed.
WRONG   (seen) "Post-Ozempic opportunity". "Replaced their entire marketing team". Both pulled off the same page, round 6.
WHY     Both wrongs are outcomes or positioning. The mechanism is the thing the agency does.
PASS    Output names community or retained-audience-after-spend as the mechanism = 1.
```

```
M-02 · MECHANISM · MCQ
INPUT   Two candidate mechanisms. (a) "get your founder on camera" (b) "we built them an owned audience". Which ships cold?
RIGHT   (b). Agency-performed and portable.
WRONG   (seen) (a). Killed by Aaman on the DTCo run.
WHY     A client-performed mechanism invites "I can't do that" before the reader reaches "is this real". Not dead, but segment-locked. Keep the proof, gate the mechanism.
PASS    Answers (b) = 1.
```

```
M-03 · MECHANISM · JUDGE
INPUT   Chamber and Transparent Labs. The master sheet says "micro content plus paid media plus the right strategy". The website is available.
RIGHT   Goes to the website and finds the humor angle. Sharpens to something like "making their ads actually entertaining". That is W1.
WRONG   (plausible) Lifts the master sheet line, which has no bite.
WHY     Agency owners file their real IP under "higher-level stuff" and write something generic on the sheet. The master sheet is usually the thinnest source.
PASS    Output names humor or entertainment as the mechanism and cites the website = 1.
```

```
M-04 · MECHANISM · CONTAINS
INPUT   Generate mechanism options for a client.
RIGHT   At least 10 variations, each referenced to a winner.
WRONG   (seen) mechanism-wordsmith hard rule "never produce more than 7". Aaman asked for 45 and had to override a stated rule.
WHY     The strategist's floor is above the skill's ceiling. Breadth is the whole point of this stage.
PASS    Variant count >= 10 and each carries a winner reference = 1.
```

```
M-05 · MECHANISM · MCQ
INPUT   SEO offer for a local business. No distinctive method exists. What goes in the mechanism slot?
RIGHT   Omit it. Carry on case study plus relevance.
WRONG   (plausible) Invent one.
WHY     An invented mechanism scores zero, not high. Correct omission is not penalised. W8, W9 and W10 all ship with no mechanism.
PASS    Answers omit = 1.
```

```
M-06 · MECHANISM · MCQ
INPUT   "I used to lead digital ad strategy at Google." Mechanism or not?
RIGHT   Not a mechanism. It is authority.
WRONG   (plausible) Treats it as the mechanism.
WHY     W7 is carried by authority and its actual mechanism is weak and not worth copying. Mislabelling this makes the system copy the wrong part of a winner.
PASS    Answers authority = 1.
```

```
M-07 · MECHANISM · JUDGE
INPUT   Kynship. Candidate mechanism: "reporting on contribution margin instead of ROAS".
RIGHT   Reject for cold SMS. Too technical. The reader has to be educated before they can care.
WRONG   (seen) Shipped as L5 and L6. Both lost.
WHY     A mechanism that needs explaining blows the SMS budget and loads the reader. The idea is fine; the channel is wrong.
PASS    Rejects with "needs explaining" or equivalent = 1.
```

---

## 2 - COPY (9 cases)

```
CP-01 · COPY · CONTAINS
INPUT   Draft T1/T2 for any client.
RIGHT   No variant ships at relevance rung 0.
WRONG   (plausible) "could do the same for {{company}} in {{niche}}", "saw {{company}} and had a few ideas".
WHY     Rung 0 is the unaided default and the enforced floor sits above it. Every shipped variant must be able to name its rung and the enrichment paying for it.
PASS    Zero variants at rung 0, and each names its rung plus enrichment = 1. S-tier case is the only exemption.
```

```
CP-02 · COPY · CONTAINS
INPUT   Draft the T2 CTA for a cold SMS.
RIGHT   Keeps the ask in-thread.
WRONG   (seen) "could I drop you an email w more info?" Went 0 for 11 meetings in July. The in-thread "pay on results" ask booked 5 in one week at the same reply rate.
WHY     Reply rate measures the hook and says nothing about where the reply goes. An email handoff moves a hot thread to a cold channel and it dies.
PASS    T2 contains no email-handoff ask = 1.
```

```
CP-03 · COPY · JUDGE
INPUT   Go Fish, TikTok Shop offer. Two openers. (a) "most fashion brands pay Meta..." (b) "noticed {{company}} isn't really running TikTok Shop lives".
RIGHT   (b). W18 shipped, got human replies and a converted call from 360 sends.
WRONG   (seen) (a) is the L1 shape. Same client, same offer, lost. Got STOPs.
WHY     An observation about a person reads human and gets a reply. A thesis about the category reads like a blast and gets STOP.
PASS    Picks (b) and names relevance, not proof strength, as the reason = 1.
```

```
CP-04 · COPY · MCQ
INPUT   Local painters. Available result: "31 leads in 30 days". Ship it or not?
RIGHT   Do not ship. Too weak, and leads is the wrong unit. Painters judge on booked jobs.
WRONG   (seen) Shipped as L8. Same capacity shape as the W4 winner, but W4 had a real number in the right unit.
WHY     Same structure, different proof strength, opposite outcome. Structure is not what carried W4.
PASS    Rejects and names both the size and the unit = 1.
```

```
CP-05 · COPY · JUDGE
INPUT   "Hey {{first_name}}. A bit random but {{company_name}} isn't showing up on ChatGPT for commercial terms like '{{relevant_search_term}}'."
RIGHT   Flag it. The relevance hook is genuinely strong but the phrasing reads AI-written.
WRONG   (seen) Shipped as L2. Lost.
WHY     The hook was right and the human read killed it. The system must be able to separate those two judgments on one line.
PASS    Flags phrasing while crediting the hook = 1. Rejecting the whole thing = 0.
```

```
CP-06 · COPY · CONTAINS
INPUT   Any drafted variant.
RIGHT   T1 and T2 within logged winner char ranges.
WRONG   (seen) W2 at 292 chars, flagged as a trim candidate.
WHY     Cheap deterministic check. Free.
PASS    Both within range = 1.
```

```
CP-07 · COPY · CONTAINS
INPUT   FOMO lever, no competitor named in the brief.
RIGHT   Uses {{competitor}} as a merge var, or a no-name FOMO frame.
WRONG   (plausible) Invents a plausible competitor name.
WHY     A fabricated competitor is a hallucination that ships to a real person who will know it is wrong.
PASS    No unsourced proper noun in the competitor slot = 1.
```

```
CP-08 · COPY · JUDGE
INPUT   A variant reads well but repeats a T2 pattern already used by another variant.
RIGHT   Differentiate upstream: change the case, angle, lever or proof detail. Or cut one variant.
WRONG   (seen) Bolted on a generic reaction line ("wild what that volume does") to force distinctness. Also: cut a load-bearing "in 3 months" to satisfy a number-density flag.
WHY     The line's job is to read like one human texting one person. Every mechanical constraint sits below that, never above it. Two variants wanting the same T2 is a signal they are too close.
PASS    Fix is applied upstream, not to the line = 1.
```

```
CP-09 · COPY · JUDGE
INPUT   Go Fish. Prospect is a small boutique. Available proofs: Willow Boutique $126k last month, EZ Bombs $5M last quarter.
RIGHT   Willow. On-niche and size-matched.
WRONG   (plausible) EZ Bombs, because the number is bigger.
WHY     "$5m/quarter" on a tiny boutique reads aspirational and irrelevant. Keep the structure and mechanism, swap only the case to a size-matched peer with its native-unit number.
PASS    Picks Willow and names size-match = 1.
```

---

## Scoring

Report the two categories separately, never as one number.

```
PIPELINE FIRED   _ / 16      (void cases, not failures)
MECHANISM        _ / 7
COPY             _ / 9
```

Then for every failure, the one line that matters:

```
CASE  __   earliest stage that made this inevitable: __________
```

That column is the phase-2 backlog. It writes itself.

---

## What Aaman still owes

- The `[REDLINE]` cases confirmed or rewritten.
- M-03, CP-09 and CP-05: the RIGHT answer there is my read of his judgment, not his stated position.
- Cases for offer shapes not covered here. Everything in phase 1 is an agency or local-services offer.
  There is no tool or product case. The June audit already named that as a corpus gap and it is still open.

---

# Appendix - parked cases

**Do not run these yet.** They were drafted before we narrowed to mechanism and copy. They are kept
because the evidence behind each one is real, and because some of them will be re-derived by the
reverse-engineering loop above. When that happens, take the version here rather than rewriting it.

33 cases across five categories: EVIDENCE 7, CALLS 7, STRATEGY 7, BENCHMARK 6, ROUTING 6.


## 1 - EVIDENCE

Does Evergreen return the right data, correctly, for the right client.

```
E-01 · EVIDENCE · MCQ
INPUT   You need the validated pain clusters for the DTC ecom niche, across all clients.
RIGHT   POST /api/clusters {"niche": "..."}
WRONG   (plausible) GET /api/clients/{slug} and read that one client's pains only
WHY     Cross-client clusters are the validated set. One client's pains are unvalidated.
PASS    Names /api/clusters = 1.
```

```
E-02 · EVIDENCE · TRACE
INPUT   Search the call corpus for "high CAC" while working on Kynship.
RIGHT   The search request carries client=kynship.
WRONG   (seen) Unscoped search returning chunks from other clients.
WHY     Cross-client leakage puts another client's language in this client's copy.
PASS    Trace shows a client scope param on every calls/deals search = 1.
```

```
E-03 · EVIDENCE · CONTAINS
INPUT   Submit the identical onboarding form twice for one client.
RIGHT   Second submission inserts 0 new pains. All skipped as duplicates.
WRONG   (seen) DTCo: 24 inserts, 9 skips.
WHY     Weak dedup poisons the pain set with near-duplicates that then get mined as if distinct.
PASS    New pain rows created on the second submit == 0.
```

```
E-04 · EVIDENCE · MCQ
INPUT   Count how many prospects for a client replied and then booked.
RIGHT   Union /deals and /contacts. Use the `opportunity` field, not `deals.contact`. Hard nos live only in /contacts.
WRONG   (seen) Query /deals alone. deals.contact is null, so the join silently returns nothing.
WHY     Both endpoints are incomplete on their own.
PASS    Trace shows both endpoints queried and unioned = 1.
```

```
E-05 · EVIDENCE · CONTAINS
INPUT   How many meetings did Wise Digital book?
RIGHT   Counts from meeting_booked_at on /deals. Deals that advanced past "Meeting Booked" still count.
WRONG   (seen) Counts stage == 'Meeting Booked' only. Wise showed 12 against 53 real.
WHY     A deal that advances leaves the stage and vanishes from the count.
PASS    Answer is within 10 percent of the meeting_booked_at count = 1.
```

```
E-06 · EVIDENCE · CONTAINS
INPUT   Sum positive replies across all campaigns for a client from /report.
RIGHT   Dedupes per-campaign rows before summing.
WRONG   (seen) Sums 46 duplicate rows of the same campaign. Top-level /stats is correct; per-campaign rows are not.
WHY     Known /report bug. Any total built off raw rows is inflated.
PASS    Total matches top-level /stats = 1.
```

```
E-07 · EVIDENCE · JUDGE
INPUT   What is the SMS send volume for Scaletopia last month, and what is the positive rate?
RIGHT   Flags that Evergreen/Airtable "sent" runs 3 to 8 times low against GHL, and either pulls the denominator from GHL or states the rate is an upper bound.
WRONG   (plausible) Reports the Evergreen rate as fact.
WHY     A rate on a wrong denominator is the number every downstream decision uses.
PASS    Output names the denominator source, or flags the discrepancy = 1.
```

---

## 2 - CALLS

Does it mine real buyer language, terminology and nuance out of the chunked call corpus.
**Aaman flagged this as the missing category. It is where copy gets its voice.**

```
C-01 · CALLS · JUDGE
INPUT   Kynship. Target the "creative volume" pain. Give me how buyers actually say it.
RIGHT   Returns verbatim buyer phrasing from a call chunk, quoted, with the chunk it came from.
WRONG   (plausible) Returns a clean paraphrase: "brands struggle to produce enough creative at scale."
WHY     The paraphrase is marketing language. The verbatim is the copy. Paraphrasing is the whole loss.
PASS    Output contains at least 2 quoted buyer phrases traceable to a chunk = 1. Paraphrase only = 0.
```

```
C-02 · CALLS · TRACE
INPUT   Full copy run for a client that has an ingested call corpus.
RIGHT   The call corpus is searched BEFORE the mechanism stage, unprompted.
WRONG   (seen) Redo: the closers' proven language sat unused until Aaman pointed at it. DTCo: same shape.
WHY     Post-hoc corpus checks confirm what was already written. Pre-mechanism searches change what gets written.
PASS    Trace shows a calls search timestamped before the first mechanism output = 1.
```

```
C-03 · CALLS · JUDGE
INPUT   Redo. What does the corpus say about how we pitch this, not just what prospects complain about?
RIGHT   Surfaces the CLOSER's pitch language (how Henry/Colby actually frame the offer on calls), not only prospect pain.
WRONG   (seen) Returns prospect pain only.
WHY     The closers have already found the phrasing that lands live. It is the highest-value ammo in the corpus and it gets left there.
PASS    Output separates "how we pitch it" from "what they complain about", with quotes for both = 1.
```

```
C-04 · CALLS · MCQ
INPUT   Home services buyer, roofing. The case study is "$1.26M in 4 months". What unit does this buyer judge on?
RIGHT   Booked jobs.
WRONG   (seen) Revenue. Shipped as L3 and L4, both lost.
WHY     A revenue number reads as budget-dependent or invented to a contractor. Their unit is jobs.
PASS    Answers booked jobs / job count = 1.
```

```
C-05 · CALLS · JUDGE
INPUT   Growth Lab, estate planning law. Give me the niche's own terminology for the outcome they want.
RIGHT   Returns niche-native terms of the "contested probate billables" kind, sourced from calls or client materials.
WRONG   (plausible) "More cases", "more revenue", "grow the firm".
WHY     W14 won on exactly this. Generic outcome language reads like a blast.
PASS    At least one term a non-specialist would not have guessed, traceable to a source = 1.
```

```
C-06 · CALLS · CONTAINS
INPUT   Run a brief for a client with zero ingested transcripts.
RIGHT   States plainly that there is no call corpus for this client and that the brief is web-led and Tier 3.
WRONG   (seen) GoFish: went web-led silently, so the brief read as if it were grounded in calls.
WHY     Silent degradation is worse than a gap, because nobody knows to distrust it.
PASS    Output contains an explicit no-transcripts statement = 1.
```

```
C-07 · CALLS · TRACE
INPUT   Ingest a transcript with mine:true.
RIGHT   Endpoint succeeds, or falls back to mine:false and says so. Run continues.
WRONG   (seen) 500 from the pgvector Vector cast in taxonomy.py. Open since at least June. Affects every client.
WHY     A hard 500 in the middle of ingest stalls the whole run.
PASS    No unhandled 500 = 1.
```

---

## 3 - STRATEGY

Frame, persona, proof spine, channel, and client constraints.

```
S-01 · STRATEGY · MCQ
INPUT   DTCo. Master sheet holds two niche segments. Proof spine is BRUNT and ARMRA. Broad ecom or niche split?
RIGHT   Broad ecom.
WRONG   (seen) Split into two niche segments. Round 3 of the 2026-09-21 run.
WHY     Both proof brands are broad ecom and not niche-locked. The frame follows the proof.
PASS    Answers broad = 1.
```

```
S-02 · STRATEGY · MCQ
INPUT   The buyer already knows this category of solution exists and has been pitched by three competitors. What frame?
RIGHT   Differentiate. Solution-aware buyer needs a reason this one is different.
WRONG   (plausible) Educate them on the problem. That is the solution-unaware move.
WHY     Wrong awareness read makes every line after it wrong, before a word is written. LAUNCH-AUDIT Part 3 item 1.
PASS    Answers differentiate = 1.
```

```
S-03 · STRATEGY · TRACE
INPUT   Full run for any client.
RIGHT   A written strategy artifact exists before any copy: frame plus reason, persona, proof spine, angles to test.
WRONG   (seen) Copy produced with the frame never stated, so it could not be challenged.
WHY     An unstated frame cannot be wrong, which means it cannot be fixed.
PASS    Run sheet stage 2 is populated before stage 4 = 1.
```

```
S-04 · STRATEGY · MCQ
INPUT   The offer is SEO for local businesses. Everyone in the category sells it. Where do the words go, mechanism or relevance?
RIGHT   Relevance. Commodity offer leans on relevance.
WRONG   (plausible) Invent a distinctive mechanism.
WHY     Unique offer leans on mechanism, commodity offer leans on relevance. Inventing a mechanism for a commodity offer produces the thing Aaman calls slop. Part 3 item 8.
PASS    Answers relevance = 1.
```

```
S-05 · STRATEGY · CONTAINS
INPUT   DTCo. The onboarding form says the ICP spends $150K to $1M per month on media. An August planning doc says $50K per month.
RIGHT   Flags the contradiction and asks which floor is current. Does not silently pick one.
WRONG   (plausible) Picks one and proceeds.
WHY     The ICP floor decides the list, the proof size and the language. Silently picking is an unlogged bet.
PASS    Output names both figures and asks = 1.
```

```
S-06 · STRATEGY · MCQ
INPUT   LeadGenix. Which channel gets the budget, SMS or email?
RIGHT   SMS. It beats email by roughly 8x on positive-per-send for this client.
WRONG   (plausible) Email, because raw reply rate looks higher.
WHY     Raw reply rate is the wrong metric. Positive-per-send plus logged deals is the metric.
PASS    Answers SMS and cites positive-per-send = 1.
```

```
S-07 · STRATEGY · CONTAINS
INPUT   DTCo. Write copy using the strongest available client logo.
RIGHT   Does not use Grüns. It is a banned namedrop for this client.
WRONG   (plausible) Uses Grüns because it is the biggest name in the set.
WHY     Client-specific constraints must survive retrieval. Retrieval ranks by strength and will surface it.
PASS    Output does not contain "Grüns" or "Gruns" = 1.
```

---

## 4 - BENCHMARK

Does it read winners and losers correctly. **This category exists because the system got it wrong in a live session.**

```
B-01 · BENCHMARK · CONTAINS
INPUT   A draft whose T2 is "not asking for your business but could I at least share a few ideas...".
RIGHT   Allowed. This is the W18 CTA that shipped and converted.
WRONG   (seen) Refused it, because the phrase appears somewhere in a losing text.
WHY     A component appearing in both winners and losers is not the variable. Presence in a loser is not guilt.
PASS    Draft is not rejected on this component = 1.
```

```
B-02 · BENCHMARK · JUDGE
INPUT   Benchmark a draft against L1 (Go Fish, CPG). The draft reuses L1's mechanism: organic viral content plus affiliate live selling.
RIGHT   Allowed. L1's why_it_failed is relevance, not mechanism. Aaman rates that mechanism as good.
WRONG   (plausible) Rejects the draft for resembling a loser.
WHY     A loser usually dies for one reason. Its other parts are live ammo. Blanket-avoiding a loser throws away its best material and misses the lesson.
PASS    Allows the mechanism and names relevance as L1's actual failure = 1.
```

```
B-03 · BENCHMARK · TRACE
INPUT   Any drafted variant reaching the strategist.
RIGHT   Each variant carries its nearest logged winner with rate, and its nearest logged loser with why_it_failed.
WRONG   (seen) DTCo: no benchmark until round 8, and only after Aaman said "use evergreen winners".
WHY     The stage exists. Nothing forces it.
PASS    Every variant has both attached = 1. Any variant missing either = 0.
```

```
B-04 · BENCHMARK · CONTAINS
INPUT   A draft structurally identical to a logged copy running 0.19% across 1,560 sends.
RIGHT   Caught and killed before the strategist sees it.
WRONG   (seen) Drafted on round 1. The data to kill it was on file. Not consulted until round 8.
WHY     This is the single most damning event in the DTCo run. It is a missing assertion, not a taste failure.
PASS    Flagged before strategist review = 1.
```

```
B-05 · BENCHMARK · JUDGE
INPUT   Benchmark a draft. Nearest winner is W4 (LeadGenix, therapists, capacity reframe).
RIGHT   Returns W4 with its n, rate, date last observed, how many independent clients it replicated in, and the sophistication it ran at. States plainly that it is unproven at higher sophistication.
WRONG   (seen) Returns W4 as "a winner", with no date and no n. winners.csv has no date, no sends and no rate column.
WHY     W4 is over a year old and may be dead. The system cannot know that because nothing tells it. Not a reasoning failure, a missing column.
PASS    Output carries all five fields = 1. [REDLINE: Aaman to confirm the five fields.]
```

```
B-06 · BENCHMARK · MCQ
INPUT   Which was the best campaign last quarter?
RIGHT   Ranked by positive or interested per send, cross-checked against logged deals.
WRONG   (plausible) Ranked by raw reply rate.
WHY     Raw reply rate counts STOPs and brush-offs as engagement. It has picked the wrong winner before.
PASS    Uses positive-per-send = 1.
```

---

## 5 - ROUTING

Did the pipeline fire at all. **Run this category first.**

```
R-01 · ROUTING · TRACE
INPUT   "Use evergreen. Look at the highest performing law firm campaigns and write copy for Growth Lab partners." No skill named.
RIGHT   The SMS skills fire. Voice profile, QA gate and winner benchmark all run.
WRONG   (seen) 2026-09-25 YS Digital test. Evergreen retrieval ran, then it wrote plain AI copy. No skill activated because the prompt did not name one.
WHY     The output was judged as mediocre copy. It was not the copy layer failing, it was the copy layer never running. Different bug, different fix.
PASS    Trace shows sms-draft and the QA gate invoked = 1.
```

```
R-02 · ROUTING · TRACE
INPUT   Any full run.
RIGHT   mechanism-wordsmith produces an artifact before sms-draft opens.
WRONG   (seen) DTCo round 5: "are u not using mechanism development skill?" The skill existed and was never fired.
WHY     Each skill is a library. None calls the next.
PASS    Trace shows the mechanism artifact timestamped before the first draft = 1.
```

```
R-03 · ROUTING · TRACE
INPUT   "Write cold SMS for {client}."
RIGHT   Runs Evidence, Strategy, Mechanism, Copy, Benchmark, QA, Learning in order. Does not jump to copy.
WRONG   (plausible) Jumps straight to drafting.
WHY     campaign-director exists to enforce this. Test that it actually does.
PASS    All seven stages present in order = 1.
```

```
R-04 · ROUTING · TRACE
INPUT   Any full run.
RIGHT   One run sheet exists with a populated artifact for every stage.
WRONG   (plausible) Stages run but leave no artifact, so nothing can be graded after the fact.
WHY     A principle written as prose does not fire. A step that produces an output does. Every graded run needs its record.
PASS    Run sheet has seven non-empty stage entries = 1.
```

```
R-05 · ROUTING · TRACE
INPUT   Force a stage to fail its gate (for example, mechanism has no source citation).
RIGHT   The run stops. The next stage does not start.
WRONG   (plausible) Logs the failure and proceeds anyway.
WHY     A gate that does not block is a comment.
PASS    Next stage did not run = 1.
```

```
R-06 · ROUTING · TRACE
INPUT   Any full run for a client with an ingested corpus.
RIGHT   call-corpus-search fires without being named.
WRONG   (seen) Not auto-invoked. Flagged in the June audit, unchanged as of the September run.
WHY     Duplicate of C-02, tested here as a routing failure rather than a content failure. Keep both; they fail for different reasons and get fixed in different places.
PASS    Trace shows the call search fired unprompted = 1.
```
