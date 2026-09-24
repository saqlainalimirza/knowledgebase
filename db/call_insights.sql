-- call_insights: comprehensive, whole-call synthesis per client — the answer to "discovery
-- shouldn't depend on the queries I thought to ask." Semantic call search returns only chunks
-- near a query; this reads the FULL transcripts in one pass and extracts everything of value
-- (buyer terminology, resonant angles, objections, pains, dream outcomes, notable quotes), so a
-- strategist gets what's actually in the calls, not just what they searched for.
--
-- Written by agents/call_synth_agent.py. One row per client (upsert on client_slug).

create table if not exists call_insights (
  id             bigserial primary key,
  client_slug    text unique not null,
  terminology    jsonb,     -- the buyer's own words / jargon / phrases
  angles         jsonb,     -- framings/hooks that landed or that prospects responded to
  objections     jsonb,     -- concerns / pushback raised on calls
  pains          jsonb,     -- pains expressed (whole-call view)
  dream_outcomes jsonb,     -- what success looks like in their words
  notable_quotes jsonb,     -- verbatim high-signal lines
  summary        text,      -- 2-4 sentence overview (embedded)
  n_calls        int,
  source_call_ids jsonb,
  embedding      vector(1536),
  refreshed_at   timestamptz default now(),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
