# Meeting: Weekly Evergreen — Aaman, Khizar, Hilal (July 10, 2026)

Source: Fathom recording, 37 min.
Purpose: Week-1 review + Khizar onboarding to the system.

## Feedback → build items

| # | Feedback (theirs) | What it needs | Status |
|---|---|---|---|
| 1 | **Categorize by OFFERS**, not just niche — "once a local SEO campaign works for Leadgenix, it connects to Digital Resource; Pirawna Amazon ↔ BAD Marketing" (Aaman) | `offers` table with **service** category (seo, local_seo, paid_ads, creative, tiktok_shop, amazon…), per client, cross-linked in graph + searchable | ◐ built Jul 11, extraction running |
| 2 | Offer sources: **case studies are the truth** ("80% rule" — Khizar), onboarding form, winners/losers sheet `offer` column | offer_agent reads case studies + copies + CSV offer column | ✅ in the agent |
| 3 | Past clients (Exchange Media, Tiger Tracks): "don't know how much I'd want to infer from that" — old playbook | Downweight/flag `past` clients' copies in ranking | ⏳ open |
| 4 | Khizar's metric: **power requests per send**, not raw positive replies — "getting better PRs is crucial now" | Use deals `positive_reply_category` in copy performance (PR-quality weighting) | ⏳ open (data exposed via deals endpoint) |
| 5 | Is the graph connected to campaigns + deals, all-time? | Campaigns ✅; deals live endpoint shipped Jul 11 ("pushing by EOD" — done) | ✅ |
| 6 | Copies not connected to campaigns (Pirawna example); maybe extract copies from deals with variant | Copy→campaign link pass + variant extraction from deals | ⏳ Week 2 |
| 7 | Cross-reference feedback on a running copy — "a bit weak until connected with campaign" | copy_metrics sync (Week 2) | ⏳ |
| 8 | Data filling: Khizar's clients' onboarding sheets not entered; Digital Resource onboarding row missing from the sheet; Aaman has some | Ingest as files arrive (`fahad-clients/` pattern works) | ◐ ongoing |
| 9 | **Kynship fully done by EOD** (Aaman) | Kynship already has onboarding+tabs+21 calls+11 cases+19 campaigns | ✅ (verify with Aaman what's missing) |
| 10 | Formal **data-ingestion process**: clear "click here to add transcript/onboarding/copy" + a "client processor" folder pattern Claude can push from | Ingestion UX + SOP doc | ⏳ Week 2–3 |
| 11 | GitHub flow: Aaman pushes his skill changes (needs GitHub account), Khizar clones repo; Hilal to run a setup session with Khizar | Enablement session + repo access | ⏳ on Aaman/Khizar |
| 12 | Timeline: raw-testable V1 in ~3.5–4 weeks; polished by **mid-August** | Sprint pacing | on track |

## Decisions made
- Offers become a first-class dimension (service-based), cross-client.
- Case studies are the primary signal for classifying what an agency really sells.
- Khizar becomes an active user/tester next week; Aaman one-shots Leadgenix SMS next.
- Aaman gets a GitHub account and owns pushing his skill/playbook changes.

## Follow-ups carried
- Strike Tax positive-reply routing question (Khizar/Zubair, ops — not system).
- Aaman testing feedback on the fixed copy search (analysis fields) still pending.
