"""campaign_stats_agent.py - persist per-campaign performance into Supabase.

Pulls two live sources and writes them onto our campaigns rows:
  1. Airtable campaign records -> sent volume (completed leads / emails sent).
  2. Airtable Deals -> outcome counts per campaign: positive replies (deals),
     POWER REQUESTS (the high-quality replies Khizar ranks by), meetings booked.

This is what makes campaign (and later per-copy) performance queryable inside the
system instead of only via the live endpoints. Idempotent; re-run any time.

Usage:
  python campaign_stats_agent.py --client kynship
  python campaign_stats_agent.py --all
"""
import os
import sys
import argparse
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.airtable import list_records

# PR (positive_replies) = EVERY deal for the campaign (a deal IS a positive reply),
# EXCEPT the few mis-tagged hard negatives that shouldn't be in Deals at all.
# power_requests = ONLY the 'power request' sub-category. booked = 'meeting booked'.
NEGATIVE_CATS = ("not interested", "wrong number", "threat", "retired",
                 "disqualified", "ai error", "out of office")


def sync(slug):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select client from client_roster where slug=%s", (slug,))
            row = cur.fetchone()
            if not row:
                print(f"{slug}: not in roster"); return
            name = row[0].replace("'", "\\'")

            # 1) sent volume per campaign (matched by airtable_campaign_id)
            camps = list_records("📢 Campaigns", formula=f"FIND('{name}', ARRAYJOIN({{📂 Clients}}))",
                                 fields=["Name", "Completed Leads", "Total Leads", "Emails Sent"])
            sent_by_rec = {}
            for r in camps:
                f = r["fields"]
                sent = f.get("Emails Sent") or f.get("Completed Leads") or 0
                sent_by_rec[r["id"]] = int(sent or 0)

            # 2) outcomes per campaign NAME from the DEALS table (a deal = a positive reply).
            # PR = count of all deals for the campaign, minus the few mis-tagged hard negatives.
            # power_requests = ONLY 'power request'; booked = meeting booked / show / won.
            cur.execute(
                """select ca.name,
                     count(*) filter (where lower(coalesce(d.positive_reply_category,'')) <> all(%s)) as pos,
                     count(*) filter (where lower(coalesce(d.positive_reply_category,'')) = 'power request') as power,
                     count(*) filter (where lower(coalesce(d.stage,'')) in ('meeting booked','show','won')
                                        or lower(coalesce(d.positive_reply_category,'')) = 'meeting booked') as booked
                   from deals d join campaigns ca on ca.id = d.campaign_id
                   where d.client_slug = %s group by ca.name""",
                (list(NEGATIVE_CATS), slug),
            )
            agg = {}
            for cname, pos, power, booked in cur.fetchall():
                agg[(cname or "").strip().lower()] = {"pos": pos, "power": power, "booked": booked}

            # 3) write onto our campaigns
            cur.execute("select id, airtable_campaign_id, name from campaigns where client_slug=%s", (slug,))
            updated = 0
            for cid, at_id, cname in cur.fetchall():
                sent = sent_by_rec.get(at_id)
                key = (cname or "").strip().lower()
                out = agg.get(key)
                if sent is None and out is None:
                    continue
                cur.execute("""update campaigns set
                                 sent=coalesce(%s, sent),
                                 positive_replies=coalesce(%s, positive_replies),
                                 power_requests=coalesce(%s, power_requests),
                                 booked=coalesce(%s, booked),
                                 stats_synced_at=now()
                               where id=%s""",
                            (sent, out and out["pos"], out and out["power"],
                             out and out["booked"], cid))
                updated += 1
        conn.commit()
        print(f"{slug}: campaigns with stats updated={updated} (deals matched on {len(agg)} campaign names)")
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
