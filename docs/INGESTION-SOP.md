# How to Add a Client's Data (SOP)

For strategists (Khizar, Aaman). Two ways to do everything: the **website** (click +
paste) or **Claude Code** (drop files in a folder and ask). Both end up in the same
system. No technical knowledge needed.

Live site: `https://knowledgebase-production-f52e.up.railway.app`

---

## Way 1 — The website (simplest)

### Add a NEW client
1. Open the site → **+ New client**.
2. Fill: client name, slug (auto), their Airtable record id (from the 📂 Clients table), niche if you know it.
3. Paste the **onboarding form** text (and account/persona tab text if you have it) into the big box.
4. Click create. AI extracts the pains/dreams/objections and tags the niche automatically.

### Add data to an EXISTING client (their page → action tabs)
- **Add case studies** — paste the case-studies tab or any case study text. AI splits them, scores tier S–D, dedups.
- **Add transcript** — paste a sales/GTM call. Give it a unique id like `clientname_call5`. AI chunks it and mines the pains.
- **Sync campaigns** — one click; pulls the client's campaigns from Airtable.
- **Synthesize niche** — refreshes the shared "niche brain" after you've added a lot.

### Copy
- Client page → **✍️ Copy** → write t1/t2 + parts, pick **status**, **variant (A/B/C)**, and the **campaign** it belongs to → Save. Linking the campaign is what gives the copy real stats later.
- Fix a wrong niche: client page header → **override** → pick niche/sub-niche → save (your choice beats the AI's, permanently).

---

## Way 2 — Claude Code (for batches of files)

1. Make a folder for the client (e.g. `fahad-clients/clientname/`) and drop everything in: onboarding form, master sheet, transcripts as .txt.
2. Tell Claude something like:
   > "Ingest this folder for {Client}. Airtable id is rec.... Use the evergreen-data skill: onboarding first, then case studies, then transcripts, then sync campaigns."
3. Claude calls the system's APIs and loads it all. It will tell you what was added.

Rules Claude already knows (from the skill): client must exist before its data; transcripts need a unique source-call-id (no duplicates); copies save as draft.

---

## What data goes where (so you know what to collect)

| You have | It becomes |
|---|---|
| Onboarding form / Tally export | client profile + confirmed pains |
| Master sheet tabs (account/persona targeting) | pains, lingo, dreams, objections |
| Master sheet case-studies tab | tiered proof (S–D) |
| Sales / GTM call transcripts | searchable call chunks + mined pains |
| Winning & losing copies (+ which campaign) | ranked copy examples with why-it-worked analysis |
| Airtable campaigns/deals | synced automatically; don't enter by hand |

**Quality notes:**
- Fathom links can't be read by the system — export/copy the transcript text itself.
- More transcripts = better pains. Clients with zero calls stay shallow (see Growth Lab).
- Always name the campaign when saving a copy — that's what connects it to real results.

## Weekly routine (15 min)
1. New call this week? → Add transcript.
2. New copy launched? → Save it with campaign + variant.
3. A copy clearly won/lost? → Update its status.
4. Added a lot to one niche? → Synthesize niche.
