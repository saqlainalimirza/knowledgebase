-- deals_dedup — the deal table with duplicate (client, email) records collapsed to ONE.
--
-- Rule: the same email address under ONE client is a duplicate record (Airtable sometimes
-- creates them) and must count only ONCE. The same email under a DIFFERENT client is a
-- legitimately separate deal and stays. Rows with no email are each kept (never collapsed).
-- Among a person's duplicate rows we keep the one with the furthest outcome
-- (booked > power request > positive), tie-broken by earliest deal_created_at, then id.
--
-- Count PRs / positives / power / booked from THIS view, not from `deals` directly.
-- `deals` itself is unchanged and still used for full listings, semantic search, and
-- prospect touch-history (where every raw row matters).

create or replace view deals_dedup as
select distinct on (
         client_slug,
         coalesce(nullif(lower(trim(email)), ''), '__rowid__' || id::text))
       *
from deals
order by
  client_slug,
  coalesce(nullif(lower(trim(email)), ''), '__rowid__' || id::text),
  (case when meeting_booked_at is not null
             or lower(coalesce(stage, '')) in ('meeting booked', 'show', 'won') then 2
        when lower(coalesce(positive_reply_category, '')) = 'power request' then 1
        else 0 end) desc,
  deal_created_at asc nulls last,
  id asc;
