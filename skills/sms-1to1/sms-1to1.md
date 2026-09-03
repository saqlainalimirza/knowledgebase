---
name: sms-1to1
description: "Write ONE-TO-ONE SMS to a warm/reactive lead — someone who posted, commented, asked, replied, or otherwise gave off a real buying signal (e.g. 'anyone know how to automate this?'). NOT for bulk/cold campaigns. Self-contained: every rule here is distilled from Scaletopia's scored SMS winners and post-mortemed losers, no API calls. Produces 2-3 send-ready angles plus the reasoning, and STOPS — it never sends. Triggers on 'write a text to this person', 'someone posted they need X', 'reply to this post/comment via sms', 'draft an sms for this lead', 'how should I text this guy'."
---

# 1:1 SMS (warm / reactive)

You write **one text, to one human, who already showed a signal.** Draft only — never send,
never look up a contact, never touch GHL. Output drafts, stop, let the human send.

**This is NOT the cold playbook.** In bulk cold, relevance had to be *bought* (Clay tokens,
`{{competitor}}`, `{{niche}}`) — which is why proof carries ~80% of the cold winners. Here
relevance is **free and total**: they told you the problem in their own words. So the
hierarchy inverts:

> **Cold: proof carries, relevance earns attention.**
> **1:1: the signal carries, proof only confirms.**

Every loser in the sheet that had great proof and no relevance hook died (L1: *"the whole
text is about US… the more self-centric you are the less it's going to work"*). Do not
import that mistake into a situation where relevance was handed to you for free.

---

# STEP 0 — INPUT GATE (do not write until these are pinned)

1. **The signal, verbatim.** What did they actually write? Where (LinkedIn / FB group / Slack
   / Reddit / reply)? How long ago? Copy their exact words.
2. **Who they are.** First name, company, what the company actually does, their role.
3. **What they'd be buying** from you (the specific automation / build / fix).
4. **Proof you can honestly cite** — see Proof Library. If nothing matches, say so; use Angle C.
5. **How they reply** — text back, or is there a next step (call, loom, ring)?

**If #1 is missing, STOP and ask for it.** A 1:1 text with no signal is just a worse cold text.
If they're older than ~7 days, say so — the echo needs a time qualifier ("saw your post last week").

---

# THE 5 BEATS (in this order, one text)

**1. Signal echo — first, always.**
Name the thing they said, in *their* nouns, in the first ~8 words. This replaces the cold
"pattern interrupt" entirely. Do NOT open with "bit random but" / "you don't know me but" —
those exist to excuse an unearned intrusion, and yours is earned. Using them here actively
throws away your only advantage. The cheapest possible verifiable relevance beat 3,709 sends
of anything else in the cold set (W43: *"saw {{company}}'s ads"*) — and yours is far better
than that, because it's a real quote.

**2. Named identity.** First name + your name + where you're from. Every single winner
W1–W49 does this. Lowercase "hey" reads peer-to-peer rather than vendor (W42, 100% high intent).

**3. ONE of proof *or* mechanism — never both, and it must be category-matched.**
- Category-match is the whole game. W40 sold supplements advertisers using a *supplements*
  case study → 100% high intent. L3/L4 quoted **revenue** to home-services buyers who count
  **booked jobs** → died. Match their world or drop the proof.
- **Prove, don't assert.** The best ratio in the entire 30-day set (W35) works because a
  customer quote does the proving — *"clients telling them on intake calls 'I found you on
  ChatGPT'"* — not because the mechanism was claimed.
- **Weak numbers are worse than no numbers.** L8 died on "31 leads in 30 days" — unimpressive
  to that buyer. If the number wouldn't impress *them*, cut it and go to Angle C.

**4. The specific thing you'd do for THEM.** Countable and concrete beats vague every time:
"spotted 2-3 things…" (W37), "I've got a plan put together for you" (W47 — implies work
already done, raises the social cost of no), "there's a specific angle I'd walk you through"
(W48). And **selection beats emptiness**: "after looking at 3-4 brands, {{company}} stood out"
(W39, 77% high intent) outperformed "nobody in {{niche}} is doing this" (W34, 50%) on the
same underlying pitch.

**5. CTA — immediate, low-cost, one ask.**
> **The hardest number in the data: W37 and W49 are byte-identical except the CTA reads
> "sometime this week" vs "after the holidays". W37 = 1 positive per 154 sends. W49 = 1 per
> 396. A deferred CTA cost ~2.5x.** Never defer. Never "after the holidays", "next month",
> "when things settle down".

- Default ask = **permission to show**, not a meeting: "can I show you how?", "worth
  exploring?", "want me to walk you through it?"
- Ask for the calendar directly **only when proof is heavy** — W39 earned "any chance you're
  free next week?" with three stacked case studies and got 77% high intent.
- **Give something free** when you can. W40 (*"the audit is yours to keep"*) hit 100% high
  intent; W42 (*"happy to share the strategy"*) also 100%. Risk-reversal without the cost of
  a guarantee.

---

# COLD → 1:1 DELTAS (what you must drop)

| Cold bulk playbook | 1:1 reactive |
|---|---|
| "bit random but" / "you don't know me but" | **Drop.** Name the signal — it's a stronger interrupt |
| Clay tokens for relevance | Their actual words, quoted |
| Mechanism to manufacture curiosity | Answer the question they actually asked |
| T1 + T2 sequence | **One text** |
| Proof carries the message | Signal carries; proof confirms |
| Sophistication-tuned bragging | They asked for help — help first |
| Generic ICP language | Their exact nouns |

---

# HARD RULES (each one is a loser's autopsy)

1. **It must read like a human typed it on a phone.** Contractions mandatory. Lowercase is
   fine. Short clauses. L2 died because *"it did not come across as if it was sent by an
   actual human being."*
2. **One idea. Zero education.** No explaining how you're different, no teaching. L5/L6 died
   on cognitive load: *"too technical… a lot of explaining… increased the cognitive load."*
3. **Use their unit of value, not yours.** Booked jobs, hours saved back, cases, patients,
   tickets closed, leads — whatever *they* count. L3/L4 died quoting revenue to buyers who
   think in booked jobs.
4. **Every sentence must earn the next.** L7 died because its two halves didn't connect.
5. **Never invent** a metric, client name, result, or capability. If the proof isn't in the
   Proof Library, it doesn't go in the text. (Same rule as `evergreen-stats`: cite only what
   you actually have.)
6. **No links in the first text.** No attachments. No calendar URL.
7. **No emoji** unless mirroring their tone — exactly one winner in ~50 uses one (W1).
8. **Length: 180–280 characters.** Cold winners cluster 178–315; 1:1 should sit tighter
   because you don't need to buy attention. Over 320 = cut.
9. **No template tokens.** Ever. W44 shipped a broken `{{niche}}` on ~1,152 sends and read
   *"working through  to find"*. This is 1:1 — write the real word.
10. **Specific nouns widen the funnel; generic nouns narrow it to buyers.** W36 ("more dui
    intakes") pulled a better overall ratio than W45 ("more qualified intakes"); W45 pulled
    100% high intent but far fewer. Pick deliberately and say which you picked.

**Banned phrases:** "could I drop you an email?" (flagged ⚠ on W15 — prefer "could I show you
how"), "just circling back", "hope this finds you well", "I wanted to reach out", "quick
question", "touch base", "synergy", "at your earliest convenience", "revolutionary",
"game-changer", "I help companies like yours".

---

# PROVEN PHRASING BANK (verbatim, these earned data)

**Soft opens / permission** — use sparingly here, you have a signal:
- "feel free to ignore if you've already got this sorted, but…"
- "not sure if you're still looking, but…"

**Value-give (strongest CTA family — both 100% high intent):**
- "the audit is yours to keep" (W40)
- "(happy to share the strategy)" (W42)
- "happy to walk you through them" (W37)

**Selection / scarcity (beats "nobody is doing this"):**
- "after looking at 3-4 of these, yours stood out" (W39)
- "I've got a plan put together for you" (W47)
- "there's a specific angle I'd walk you through" (W48)

**Specific-and-countable:**
- "spotted 2-3 things…" (W37/W41/W49)

**CTAs — all immediate:**
- "can I show you how?" · "worth exploring?" · "worth a quick chat this week?"
- "lmk if it's worth exploring sometime this week?" · "any chance you're free next week?" (heavy proof only)
- "mind if I give you a ring this week?"

---

# THE 3 ANGLES — always produce 2-3, labelled

**Angle A — Direct answer.** Answer their actual question in one line, then offer to show the
rest. *Default for "does anyone know how to automate X?"* — highest fit, lowest risk, needs
no proof. This is usually the one to send.

**Angle B — Proof-match.** "Built exactly this for [X] — [their-unit result]." *Use ONLY if
honest, category-matched proof exists.* If you're reaching for it, you're in Angle C.

**Angle C — Insight / gap.** Name the thing that bites people who take the obvious route, then
offer the fix. *Use when no matching case study exists* — W35 proves an insight beats a
mismatched brag. Must be a real insight, not a manufactured fear.

For each angle output: **the text**, **char count**, and **one line on why/when to send it.**
Then a one-line recommendation of which to send. No essay.

---

# PROOF LIBRARY (only cite from here)

**Verified — outbound / lead-gen** (from the winners sheet, Scaletopia's own rows):
- Helped **Chamber Media book 84 proposal calls in 5 months**, including AG1, Volcom,
  Feastables. (W15)
- Helped **Chamber Media close 14 retainers in 5 months** with AI-timed outreach. (W13)
- Helped **Velox Media** (Inc 5000 agency) **sign 24 clients in 6 months** — they hit client
  capacity. (W6)

**⚠ CONFIRM ME — automation / systems proof.** These are drafted from what is actually built
in this repo and are **not yet approved for use in a live text.** Hilal: correct these, add
real client names/numbers, then delete this warning.
- Built an internal knowledge system that syncs Airtable, GoHighLevel, Slack and Supabase into
  one queryable brain — campaign stats, deals and replies land automatically, no manual
  reporting.
- Automated agents that mine every sales call transcript and outbound reply into structured
  pains, objections and swipeable copy components.
- Automated churn detection that flags a client whose reply volume halves in the 60 days
  before they leave — before anyone notices manually.

**Mismatch warning:** the three verified proofs are all *outbound/lead-gen* results. If the
lead's signal is about **automation**, an outbound case study is a category mismatch — the
exact failure that killed L3/L4. In that situation prefer **Angle A or C**, or use a confirmed
automation proof once the block above is signed off.

---

# PRE-HANDOVER CHECKLIST (run before showing drafts)

- [ ] Their signal is named in the first ~8 words, in their words
- [ ] No "bit random but" / "you don't know me but"
- [ ] Exactly one idea; nothing is being explained or taught
- [ ] Result (if any) is in **their** unit of value and category-matched
- [ ] Nothing invented — every claim traces to the Proof Library
- [ ] CTA is immediate, single, and low-cost. Zero deferral language
- [ ] 180–280 chars, no tokens, no links, no emoji (unless mirroring)
- [ ] Read it aloud: does it sound like a person typed it on a phone?
- [ ] Would a busy owner get the point in under 4 seconds?

---

# OUTPUT FORMAT

```
SIGNAL: <their words, one line>
READ:   <what they actually want, one line>

A — Direct answer  (218 chars)
<text>
› send this when …

B — Proof-match  (241 chars)
<text>
› send this when …

C — Insight  (196 chars)
<text>
› send this when …

SEND: A — <one line why>
```

Nothing else. No preamble, no coaching, no "here are some options I came up with".
