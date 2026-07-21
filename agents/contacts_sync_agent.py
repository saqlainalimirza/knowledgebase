"""contacts_sync_agent.py - persist the Airtable Contacts (Synced From CRM) table.

This is the reply-intelligence layer: EVERY contacted lead with its reply
categorisation (Meeting Booked, Positive, Power Request, Objection Handling,
Not Interested, Maybe, Custom Response, ...), the full conversation, variant and
campaign. Deals is the subset that became opportunities; contacts is everything.

Purpose (from the July 20 plan): give Claude a first-party place to read reply
categories and threads so it never bulk-pulls GHL/Smartlead MCP (which exhausts
API credits and knocks over the automations).

Volume is high (thousands per client), so we store ALL of them for category
aggregates + filtering, but only embed the MEANINGFUL categories (skip
Not Interested / Neutral / Disqualified / AI Error / Out Of Office noise) — the
embed sweep skips rows whose conversation text resolves to NULL for those.

Idempotent (upsert on airtable_contact_id). Incremental-friendly.

Usage:
  python contacts_sync_agent.py --client kynship
  python contacts_sync_agent.py --all
"""
import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.airtable import list_records
from shared.embed import embed_all
from shared.taxonomy import _buckets

TABLE = "tblt1m8y8uRGJKykV"  # Contacts (Synced From CRM)
FIELDS = ["Name", "Date created", "Title", "email", "Mobile Number", "Company Name",
          "Website", "LinkedIn profile", "Lead Categorisation", "Contact Root Source",
          "Email history", "Client", "Copy Variant", "Relinked Campaigns", "Campaign"]


def _channel(src):
    s = ",".join(src) if isinstance(src, list) else str(src or "")
    if "GoHighLevel" in s: return "sms"
    if "Smartlead" in s or "EmailBison" in s: return "email"
    if "Website" in s: return "website"
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
                t = str(text).strip().lower()
                for cid, cname in camps:
                    if cname and (t == cname or t in cname or cname in t):
                        return cid
                return None

            recs = list_records(TABLE, formula=f"FIND('{name}', ARRAYJOIN({{Client}}))", fields=FIELDS)

            ins = 0
            for rec in recs:
                f = rec["fields"]
                title = f.get("Title")
                func, sen = _buckets(title)
                camp_text = f.get("Relinked Campaigns")
                cur.execute(
                    """insert into contacts(airtable_contact_id, client_slug, name, title,
                         job_function, seniority, company, website, linkedin, email, mobile,
                         lead_category, channel, campaign_name, db_campaign_id, copy_variant,
                         conversation, created_at)
                       values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       on conflict (airtable_contact_id) do update set
                         lead_category=excluded.lead_category,
                         conversation=excluded.conversation,
                         campaign_name=excluded.campaign_name,
                         db_campaign_id=excluded.db_campaign_id,
                         copy_variant=excluded.copy_variant,
                         synced_at=now()""",
                    (rec["id"], slug, f.get("Name"), title, func, sen,
                     f.get("Company Name"), f.get("Website"), f.get("LinkedIn profile"),
                     f.get("email"), f.get("Mobile Number"),
                     f.get("Lead Categorisation"), _channel(f.get("Contact Root Source")),
                     camp_text, match_campaign(camp_text), f.get("Copy Variant"),
                     f.get("Email history"), f.get("Date created")),
                )
                ins += 1
        conn.commit()
        # invalidate embeddings whose conversation changed materially: only NULLs get filled,
        # so nothing extra to do — the sweep embeds new/meaningful rows.
        n = embed_all(conn, only_tables={"contacts"})
        print(f"{slug}: contacts upserted={ins}, embedded(new meaningful)={n}")
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
            try:
                sync(s)
            except Exception as e:
                print(f"{s}: ERR {e}")
    elif args.client:
        sync(args.client)
    else:
        raise SystemExit("pass --client or --all")
