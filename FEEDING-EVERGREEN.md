# Feeding Evergreen — a guide for Aaman

Evergreen gets fed **two ways**. Knowing which is which is the whole thing:

1. **Automatic, from Airtable.** Campaigns, deals, daily send stats, client status, meetings —
   these sync into Evergreen **every night on their own**. You do NOT copy these anywhere. If
   it lives in the ops Airtable, it's already flowing in. (New active clients now auto-appear too.)
2. **You add it, by telling your Claude.** The *knowledge* — a client's voice, sales calls,
   case studies, rules, winning copy — is not in the ops Airtable, so Evergreen can't sync it.
   You add it by **talking to Claude** (with the evergreen-research skill on). Claude writes it
   straight into Evergreen. You never touch Airtable for these.

**The rule of thumb:** numbers and campaign data = automatic. Words, voice, calls, rules = you
tell Claude.

---

## What you add, and exactly what to say

For each, load the **evergreen-research** skill and say it in plain English. Always name the client.

| You want to add… | Say to your Claude… | Why it matters |
|---|---|---|
| **Client voice / positioning / offer / pricing** (their proposal, deck, website copy, how they talk) | *"Save this to Evergreen as {client}'s positioning:"* then paste it | Biggest gap right now. This is what lets copy sound like the client instead of generic. |
| **A sales call** (Fathom/Zoom transcript) | *"Ingest this call transcript for {client}:"* then paste it | This is the ONLY way a client gets its own real buyer pains and objections. |
| **A case study / proof** | *"Save this case study to Evergreen for {client}:"* then paste it | Gives the writer real, category-matched proof to cite. |
| **A rule or preference** ("never mention price in the first text", "always lead with the audit") | *"Save this into Evergreen as a guideline for {client}: …"* (leave the client out for an agency-wide rule) | Standing rules the writer must follow. |
| **Copy that ran / worked** | *"Save this copy to Evergreen for {client}, campaign {name}:"* then paste it | It gets stamped with its real results and feeds future briefs. |
| **A brand-new client not in Airtable yet** | *"Onboard {client} into Evergreen"* (give niche if you know it) | Sets them up so everything else can attach. |

---

## What you should NOT do

- Don't copy campaign stats, deals, or send numbers into Evergreen by hand. They sync nightly.
  If a number looks stale, it's just the ~1-day feed lag, not something you need to fix.
- Don't paste secrets or passwords.
- Don't try to "add pains" directly. Pains are **produced** from the calls you ingest. Feed the
  call, and Evergreen mines the pains itself.

---

## How to pull it back (check it landed)

After you add something, you can confirm it:
- *"Brief me on {client}"* — Claude pulls the winners, objections, voice, and pains it has.
- *"What materials does Evergreen have for {client}?"*
- *"What guidelines are saved for {client}?"*

If what you added shows up there, it's in.

---

## The 30-second version

- **Numbers/campaigns** → already syncing, do nothing.
- **Voice, calls, case studies, rules, copy** → tell your Claude *"save this to Evergreen for {client}"* and paste it.
- **Want a client's own pains?** → feed its **call transcripts**. That's the only source.
- To use any of it later: *"brief me on {client}"* before writing.

---

## Two things worth doing first (biggest impact)

1. **Feed each active client's positioning / voice doc.** Right now this is nearly empty for
   everyone, and it's the main reason copy reads generic. One paste per client.
2. **Feed sales-call transcripts for clients missing pains** (e.g. big_leap, acceler8 have
   none). Each call you paste turns into that client's real buyer pains and objections.
