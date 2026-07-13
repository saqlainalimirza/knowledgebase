"""deals_sync_agent.py - persist Airtable Deals into Supabase.

Mirrors each client's deals (outcome, variant, job title, company, conversation) into
the deals table, matches the campaign to our campaigns row by name, buckets the job
title, and embeds the reply conversation so it is semantically searchable
("find conversations where price objections got handled").

Idempotent (upsert on airtable_deal_id). Re-run any time; stage changes update.

Usage:
  python deals_sync_agent.py --client kynship
  python deals_sync_agent.py --all
"""
import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.airtable import list_records
from shared.embed import embed_all
from shared.taxonomy import _buckets

FIELDS = ["Opportunity", "Date created", "Pipeline stage", "Positive Reply Category",
          "Lost reason", "closed-amount", "Source Select", "Source", "Company Name",
          "Email", "LinkedIn profile", "Location", "Primary contact",
          "Title (from Contacts)", "Copy Variant (from Contacts)",
          "Campaign (from Contacts)", "📢 Campaigns", "Email conversation", "Notes",
          "Date of Meeting Booked"]


def _channel(src):
    s = ",".join(src) if isinstance(src, list) else str(src or "")
    if "GoHighLevel" in s: return "sms"
    if "Smartlead" in s or "EmailBison" in s: return "email"
    return s.lower() or None


def sync(slug):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select client from client_roster where slug=%s", (slug,))
            row = cur.fetchone()
            if not row:
                print(f"{slug}: not in roster"); return
            name = row[0].replace("'", "\\'")

            cur.execute("select id, lower(name) from campaigns where client_slug=%s", (slug,))
            camps = cur.fetchall()

            def match_campaign(text):
                if not text: return None
                t = text.strip().lower()
                for cid, cname in camps:
                    if cname and (t == cname or t in cname or cname in t):
                        return cid
                return None

            recs = list_records("Deals", formula=f"FIND('{name}', ARRAYJOIN({{Client}}))",
                                fields=FIELDS)
            ins = upd = 0
            for r in recs:
                f = r["fields"]
                cname = (f.get("Campaign (from Contacts)") or f.get("📢 Campaigns") or "").strip() or None
                title = f.get("Title (from Contacts)")
                func, sen = _buckets(title)
                notes = f.get("Notes")
                if isinstance(notes, dict):  # richText comes as object sometimes
                    notes = str(notes)
                vals = dict(
                    airtable_deal_id=r["id"], client_slug=slug,
                    campaign_id=match_campaign(cname), campaign_name=cname,
                    variant=f.get("Copy Variant (from Contacts)"),
                    channel=_channel(f.get("Source Select") or f.get("Source")),
                    stage=f.get("Pipeline stage"),
                    positive_reply_category=f.get("Positive Reply Category"),
                    lost_reason=f.get("Lost reason"),
                    closed_amount=f.get("closed-amount"),
                    contact=f.get("Primary contact") or f.get("Opportunity"),
                    job_title=title, job_function=func, seniority=sen,
                    company=f.get("Company Name"), email=f.get("Email"),
                    linkedin=f.get("LinkedIn profile"), location=f.get("Location"),
                    conversation=f.get("Email conversation"), notes=notes,
                    meeting_booked_at=f.get("Date of Meeting Booked"),
                    deal_created_at=f.get("Date created"),
                )
                cols = list(vals.keys())
                cur.execute(
                    f"""insert into deals ({','.join(cols)})
                        values ({','.join(['%s']*len(cols))})
                        on conflict (airtable_deal_id) do update set
                          campaign_id=excluded.campaign_id, campaign_name=excluded.campaign_name,
                          variant=excluded.variant, stage=excluded.stage,
                          positive_reply_category=excluded.positive_reply_category,
                          lost_reason=excluded.lost_reason, closed_amount=excluded.closed_amount,
                          job_title=excluded.job_title, job_function=excluded.job_function,
                          seniority=excluded.seniority,
                          conversation=excluded.conversation, notes=excluded.notes,
                          meeting_booked_at=excluded.meeting_booked_at, synced_at=now(),
                          conversation_embedding=case when deals.conversation is distinct from
                            excluded.conversation then null else deals.conversation_embedding end
                        returning (xmax = 0)""",
                    list(vals.values()),
                )
                if cur.fetchone()[0]: ins += 1
                else: upd += 1
        conn.commit()
        n = embed_all(conn, only_tables={"deals"})
        print(f"{slug}: deals inserted={ins} updated={upd}, conversations embedded={n}")
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select slug from client_roster where status='active' order by slug")
        slugs = [r[0] for r in cur.fetchall()]; conn.close()
        for s in slugs:
            sync(s)
    elif args.client:
        sync(args.client)
    else:
        raise SystemExit("pass --client or --all")
