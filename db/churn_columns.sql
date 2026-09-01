-- Churn tracking on client_roster.
-- churned_at already existed; these add the rest of the churn facts we mirror from
-- the Airtable CRM (see agents/churn_sync_agent.py). Applied to the live Supabase DB
-- on 2026-09-01; kept here for reproducibility.
alter table client_roster
  add column if not exists churn_status text,   -- CRM 'Client Status': Active / Paused / Churned
  add column if not exists churn_reason text,   -- seeded from status; editable for a real reason
  add column if not exists onboarded_at timestamptz;  -- CRM 'Client Onboarding Date' (tenure start)
