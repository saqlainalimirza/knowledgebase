-- Learnings: structured, durable insights derived from real A/B performance, that feed
-- future briefs. Richer than the blunt winner/loser flag — carries the numbers, confidence
-- and the action, so the next run reads "case-study-led beat pain-led here (300v300, +4.3pp,
-- confirmed) — do more of it" instead of a human re-deriving it every time.
--
-- Written by agents/learnings_agent.py (nightly), from variant-performance (the significance-
-- gated authority). confidence 'ok' -> status 'confirmed'; 'directional' -> 'proposed' (needs a
-- human ok). Idempotent: re-runs update the numbers in place via the unique key.

create table if not exists learnings (
  id           bigserial primary key,
  client_slug  text not null,
  campaign_id  bigint,
  dimension    text not null,          -- 'variant' | 'lever' | 'pattern' | 'angle'
  winner_value text,
  loser_value  text,
  metric       text default 'positive_rate',
  winner_n     int,
  loser_n      int,
  delta_pp     numeric,                -- winner_rate - loser_rate, in points
  confidence   text,                   -- 'ok' | 'directional'
  status       text default 'proposed',-- 'confirmed' | 'proposed'
  statement    text not null,          -- the human-readable line the brief prints
  evidence     jsonb,                  -- {campaign, variants, source:'variant-performance'}
  source       text default 'auto',
  active       boolean default true,
  embedding    vector(1536),
  refreshed_at timestamptz default now(),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- one learning per (client, campaign, dimension, winner vs loser) — re-runs upsert in place
create unique index if not exists learnings_key on learnings
  (client_slug, coalesce(campaign_id, 0), dimension, coalesce(winner_value, ''), coalesce(loser_value, ''));

create index if not exists learnings_client on learnings (client_slug) where active;

-- provenance on copies so the nightly agent's auto-labels never clobber a human's manual call
alter table copies add column if not exists status_source    text default 'manual';  -- 'manual' | 'auto'
alter table copies add column if not exists status_labeled_at timestamptz;
