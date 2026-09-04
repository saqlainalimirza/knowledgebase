-- One logical campaign per (client_slug, name). The team creates many Airtable campaign
-- records that share a name (one per send/batch); each has its own real `sent`, but the
-- stats agent attributes positives/power/booked BY NAME, so every record carries the same
-- figure. Naive SUM over the raw rows inflates stats Nx. This rollup: SUM(sent), take the
-- name-level stat ONCE (max), expose source_rows + primary_id.
create or replace view campaign_rollup as
select client_slug, name,
       max(niche) as niche, max(channel) as channel, max(segment) as segment, max(angle) as angle,
       sum(coalesce(sent,0)) as sent,
       sum(coalesce(replies,0)) as replies,
       sum(coalesce(bounces,0)) as bounces,
       max(coalesce(positive_replies,0)) as positive_replies,
       max(coalesce(power_requests,0)) as power_requests,
       max(coalesce(booked,0)) as booked,
       count(*) as source_rows,
       (array_agg(id order by coalesce(sent,0) desc))[1] as primary_id,
       case when sum(coalesce(sent,0))>0
            then round(max(coalesce(power_requests,0))::numeric / sum(coalesce(sent,0)), 5) end as power_rate
from campaigns group by client_slug, name;
