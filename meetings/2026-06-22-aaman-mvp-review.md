# Meeting: Aaman — MVP Review (June 22, 2026)

Source: Fathom recording, 24 min. Participants: Aaman, Hilal.
Purpose of this doc: turn the meeting's feedback into trackable build items. Update the
Status column as things ship; carry ⏳ items into the next meeting's agenda.

## Feedback → build items

| # | Feedback (theirs) | What it needs | Status |
|---|---|---|---|
| 1 | Skill was weak, just guided the system | Skill rework: data-supply scope, full API reference | ✅ done (evergreen-data skill) |
| 2 | No winning copies in system; backfill 25W/20L per client | Copies backfill + weekly fill routine | ✅ 20W/8L ingested; weekly routine ⏳ |
| 3 | Copy upload should pick its campaign → stats auto-connect | Copy editor campaign link | ✅ done (MVP editor) |
| 4 | Campaigns run A/B/C variants; need per-variant attribution | `variant` on copies + Deals sync | ⏳ Week 2–3 (deals endpoint live, live-read) |
| 5 | "DTC ecom" too broad → niche + sub-niche | Canonical taxonomy + tagging | ✅ done (25 niches, tag-on-write, override UI) |
| 6 | Job titles + employee ranges; learn per-role | Deals data (Title from Contacts) + buckets | ◐ buckets exist; full titles via deals endpoint (live) |
| 7 | copy → campaign → deals → job titles + conversations | Attribution chain | ◐ live via `/api/clients/{slug}/deals`; DB persistence Week 3 |
| 8 | Inbox management later ("why are people saying no") | Schema seam | ◐ `positive_reply_category`/`lost_reason` exposed in deals endpoint |
| 9 | Clients without calls (GoFish): analyst research layer | `client_drafts` | ⏳ planned (Week 1 plan §schema) |
| 10 | Client page shows only short summary | Full-context dashboard | ⏳ Week 4 |
| 11 | Copy should hit rewrite-quality first take | Skill + data quality loop | ◐ API bug fixed (analysis fields); Aaman re-testing |
| 12 | Better tagging system = main DB need | Taxonomy | ✅ done |
| 13 | Email workflow later — same data, new skill | Email skill | ⏳ Week 5 |
| 14 | SOPs + recorded Claude session for strategist | Enablement | ⏳ Week 6 |
| 15 | Leads inventory — separate system | Out of scope this sprint | ⏳ tracked |

## Decisions made in the meeting
- Aaman provides per-client Drive folders (transcripts, copies + campaign names, drafts).
- Weekly update call; Aaman reviews for logical gaps.
- Six-week sprint, Jordan kickoff Monday.
- Fahad leaving; Aaman does delivery in the interim and tests the system himself.

## Follow-ups that came from later feedback (post-meeting)
- Aaman (Jul 10): copy quality "kind of the same" → root-caused to search API not
  returning analysis fields; fixed + deployed. Awaiting his re-test.
- Deals live endpoint shipped early (Jul 11) to unblock variant/job-title questions.
