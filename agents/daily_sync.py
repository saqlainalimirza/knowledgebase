"""daily_sync.py - the one scheduled job that keeps the system fresh.

Runs, in order, for every active client:
  1. campaign sync        (new/renamed campaigns from Airtable)
  2. campaign stats       (sent / positives / power requests / booked)
  3. deals sync           (stages move, new deals, conversations embedded)
then:
  4. niche brains         (re-synthesize each canonical niche)
  5. embedding sweep      (fill any NULL vectors anywhere)

Each step is isolated: one failure is recorded and the rest still run. Every run
writes a row to sync_log so the app can show when data was last refreshed.

Usage:
  python daily_sync.py            # full run
  python daily_sync.py --only stats,deals   # subset (comma list: campaigns,stats,deals,brains,embeds)
"""
import os
import sys
import time
import argparse
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from shared.embed import embed_all


def _ensure_log_table():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""create table if not exists sync_log(
          id bigserial primary key,
          started_at timestamptz default now(),
          finished_at timestamptz,
          ok boolean,
          summary text
        )""")
    conn.commit()
    conn.close()


def _active_slugs():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("select slug from client_roster where status='active' order by slug")
    slugs = [r[0] for r in cur.fetchall()]
    conn.close()
    return slugs


def _canonical_niches():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""select n.name from niches n
                   where n.parent_id is null
                     and exists (select 1 from client_roster cr where cr.niche_id = n.id)""")
    names = [r[0] for r in cur.fetchall()]
    conn.close()
    return names


def run(only=None):
    _ensure_log_table()
    steps = only or ["campaigns", "stats", "deals", "contacts", "slack", "brains", "embeds"]
    t0 = time.time()
    lines, ok = [], True

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("insert into sync_log(summary) values ('running...') returning id")
        log_id = cur.fetchone()[0]
    conn.commit(); conn.close()

    slugs = _active_slugs()

    if "campaigns" in steps:
        try:
            from campaign_sync_agent import run as camp_run
            for s in slugs:
                try: camp_run(s, None, False)
                except SystemExit: pass
                except Exception as e: lines.append(f"campaigns {s}: ERR {e}")
            lines.append(f"campaigns: synced for {len(slugs)} clients")
        except Exception as e:
            ok = False; lines.append(f"campaigns: FAILED {e}")

    if "stats" in steps:
        try:
            from campaign_stats_agent import sync as stats_sync
            for s in slugs:
                try: stats_sync(s)
                except Exception as e: lines.append(f"stats {s}: ERR {e}")
            lines.append(f"stats: refreshed for {len(slugs)} clients")
        except Exception as e:
            ok = False; lines.append(f"stats: FAILED {e}")

    if "deals" in steps:
        try:
            from deals_sync_agent import sync as deals_sync
            for s in slugs:
                try: deals_sync(s)
                except Exception as e: lines.append(f"deals {s}: ERR {e}")
            lines.append(f"deals: refreshed for {len(slugs)} clients")
        except Exception as e:
            ok = False; lines.append(f"deals: FAILED {e}")

    if "brains" in steps:
        try:
            from niche_synth_agent import run as synth_run
            for n in _canonical_niches():
                try: synth_run(n)
                except Exception as e: lines.append(f"brain '{n}': ERR {e}")
            lines.append("brains: re-synthesized")
        except Exception as e:
            ok = False; lines.append(f"brains: FAILED {e}")

    if "contacts" in steps:
        try:
            from contacts_sync_agent import sync as contacts_sync
            for s in slugs:
                try: contacts_sync(s)
                except Exception as e: lines.append(f"contacts {s}: ERR {e}")
            lines.append(f"contacts: refreshed for {len(slugs)} clients")
        except Exception as e:
            ok = False; lines.append(f"contacts: FAILED {e}")

    if "slack" in steps:
        try:
            from connections import slack as slack_conn
            if slack_conn.enabled():
                from slack_sync_agent import sync as slack_sync
                for s in slugs:
                    try: slack_sync(s)
                    except Exception as e: lines.append(f"slack {s}: ERR {e}")
                lines.append(f"slack: refreshed for {len(slugs)} clients")
            else:
                lines.append("slack: skipped (no SLACK_BOT_TOKEN)")
        except Exception as e:
            ok = False; lines.append(f"slack: FAILED {e}")

    if "embeds" in steps:
        try:
            conn = get_conn()
            n = embed_all(conn)
            conn.close()
            lines.append(f"embeds: filled {n} missing vectors")
        except Exception as e:
            ok = False; lines.append(f"embeds: FAILED {e}")

    mins = round((time.time() - t0) / 60, 1)
    summary = f"[{mins} min] " + " | ".join(lines)
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("update sync_log set finished_at=now(), ok=%s, summary=%s where id=%s",
                    (ok, summary[:4000], log_id))
    conn.commit(); conn.close()
    print(summary)

    # optional: post the run summary to a Slack channel (ops visibility)
    notify_channel = os.environ.get("SLACK_SYNC_CHANNEL")
    if notify_channel:
        try:
            from connections import slack as slack_conn
            if slack_conn.enabled():
                icon = "✅" if ok else "⚠️"
                slack_conn.post_message(notify_channel, f"{icon} Evergreen daily sync {summary[:2500]}")
        except Exception as e:
            print(f"slack notify failed: {e}")
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None, help="comma list: campaigns,stats,deals,brains,embeds")
    args = ap.parse_args()
    only = [s.strip() for s in args.only.split(",")] if args.only else None
    try:
        sys.exit(0 if run(only) else 1)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
