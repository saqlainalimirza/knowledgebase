-- Per-day send volume, ingested from the Airtable CRM's daily stat tables
-- (📱 Daily SMS Stats -> channel 'sms', 📧 Daily Email Stats -> channel 'email').
-- Lets month-over-month trends (PR per SMS by month, was summer slow) be one fast query
-- instead of rebuilding send volume from Airtable each time. See agents/daily_stats_sync_agent.py.
-- Applied to the live Supabase DB on 2026-09-02.
create table if not exists daily_stats(
  id bigserial primary key,
  airtable_id text unique,
  client_slug text not null,
  channel text not null,          -- 'sms' | 'email'
  stat_date date,
  sent int default 0,             -- messages sent that day (SMS texts / emails)
  leads_reached int,              -- email only (New Leads Reached); null for sms
  replies int,                    -- email only (Replies Count); null for sms
  synced_at timestamptz default now()
);
create index if not exists daily_stats_client_date on daily_stats(client_slug, channel, stat_date);
