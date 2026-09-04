-- Email reply + bounce counts per campaign, mirrored from the Airtable Campaign fields
-- 'Email Replies' and 'Email Bounces' by campaign_stats_agent. replies = ALL email replies
-- (not positive replies / PRs); bounces = hard/soft bounces. SMS campaigns leave both null.
-- reply_rate / bounce_rate are derived (÷ sent) in the /report endpoint.
-- Applied to the live Supabase DB on 2026-09-04. campaign_rollup.sql sums these (see that file).
alter table campaigns
  add column if not exists replies int,
  add column if not exists bounces int;
