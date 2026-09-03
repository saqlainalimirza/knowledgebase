"""daily_stats_sync_agent.py - pull per-day send volume into Evergreen.

Evergreen stored only a lifetime sent total per campaign, so any "by month" question
(PR per SMS in June vs July, was summer slow) had to rebuild send volume from Airtable
every time = slow. This ingests the CRM's daily stat tables once so monthly trends are a
single fast query:

  📱 Daily SMS Stats   -> channel 'sms'   (Daily SMS Sent = messages)
  📧 Daily Email Stats -> channel 'email' (Emails Sent = messages, New Leads Reached = leads)

Rows land in daily_stats(client_slug, channel, stat_date, sent, leads_reached, replies).
Idempotent (upsert on airtable_id). Re-run any time.

Usage:
  python daily_stats_sync_agent.py --all
"""
import os
import sys
import argparse
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.airtable import iter_record_pages


def _num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _client_id(f):
    v = f.get("📂 Clients") or f.get("Clients (from Campaign)")
    if isinstance(v, list):
        return v[0] if v else None
    return v


def _rowmap(cur):
    """Airtable client record id -> slug (from the roster we already link in churn-sync)."""
    cur.execute("select airtable_client_id, slug from client_roster where airtable_client_id is not null")
    return {rid: slug for rid, slug in cur.fetchall()}


FULL_SINCE = "2025-01-01"  # one-time backfill floor (last ~2 years)


def _sync_table(conn, table, channel, date_field, sent_field, leads_field, replies_field, id2slug, since):
    """Page through the table sorted by date DESC, committing each page, and STOP as soon
    as a page falls before `since`. Reads only recent pages instead of the whole table."""
    fields = [date_field, sent_field, "📂 Clients"]
    if leads_field:
        fields.append(leads_field)
    if replies_field:
        fields.append(replies_field)
    ins = skipped = 0
    stop = False
    for page in iter_record_pages(table, fields=fields, sort=[(date_field, "desc")]):
        with conn.cursor() as cur:
            for r in page:
                f = r["fields"]
                d = str(f.get(date_field) or "")[:10]
                if d and d < since:
                    stop = True
                    continue
                slug = id2slug.get(_client_id(f))
                if not slug:
                    skipped += 1
                    continue
                cur.execute(
                    """insert into daily_stats(airtable_id, client_slug, channel, stat_date, sent, leads_reached, replies)
                       values (%s,%s,%s,%s,%s,%s,%s)
                       on conflict (airtable_id) do update set
                         client_slug=excluded.client_slug, channel=excluded.channel,
                         stat_date=excluded.stat_date, sent=excluded.sent,
                         leads_reached=excluded.leads_reached, replies=excluded.replies,
                         synced_at=now()""",
                    (r["id"], slug, channel, f.get(date_field), _num(f.get(sent_field)),
                     _num(f.get(leads_field)) if leads_field else None,
                     _num(f.get(replies_field)) if replies_field else None),
                )
                ins += 1
        conn.commit()
        if stop:
            break
    return ins, skipped


def sync(full=False):
    # Nightly: only re-pull the last ~14 days (fast, idempotent upsert). --full backfills
    # to FULL_SINCE. Either way the sorted early-break reads only pages back to the cutoff.
    since = FULL_SINCE if full else (date.today() - timedelta(days=14)).isoformat()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            id2slug = _rowmap(cur)
        s_ins, s_skip = _sync_table(conn, "📱 Daily SMS Stats", "sms",
                                    "Report Date", "Daily SMS Sent", None, None, id2slug, since)
        print(f"daily_stats: sms rows={s_ins} (skipped {s_skip} unmapped) since {since}")
        e_ins, e_skip = _sync_table(conn, "📧 Daily Email Stats", "email",
                                    "Date", "Emails Sent", "New Leads Reached", "Replies Count", id2slug, since)
        print(f"daily_stats: email rows={e_ins} (skipped {e_skip} unmapped) since {since}")
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--full", action="store_true", help="backfill to 2025 (default: last 14 days)")
    args = ap.parse_args()
    sync(full=args.full)
