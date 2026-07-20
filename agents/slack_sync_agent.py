"""slack_sync_agent.py - ingest each client's Slack channel into the memory.

Every client has a Slack channel (its id lives on the Airtable 📂 Clients record,
field "Slack Channel ID"). This agent pulls new messages since the last sync,
stores them (dedup on channel+ts), and embeds them — so client feedback, campaign
discussions, and updates from Slack become semantically searchable like everything
else. Incremental: each run only fetches messages newer than the last stored ts.

Requires SLACK_BOT_TOKEN (setup steps in connections/slack.py) and the bot invited
to each channel (/invite @botname). Skips gracefully when the token is missing.

Usage:
  python slack_sync_agent.py --client kynship
  python slack_sync_agent.py --all
"""
import os
import re
import sys
import argparse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.airtable import get_record
from connections import slack
from shared.embed import embed_all

SKIP_SUBTYPES = {"channel_join", "channel_leave", "bot_message"}


def _clean(text):
    if not text:
        return ""
    text = re.sub(r"<@[A-Z0-9]+>", "@user", text)          # user mentions
    text = re.sub(r"<#[A-Z0-9]+\|([^>]*)>", r"#\1", text)  # channel refs
    text = re.sub(r"<(https?://[^>|]+)(\|[^>]*)?>", r"\1", text)  # links
    return text.strip()


def sync(slug):
    if not slack.enabled():
        print(f"{slug}: SLACK_BOT_TOKEN not set — skipped (see connections/slack.py)")
        return
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select airtable_client_id from client_roster where slug=%s", (slug,))
            row = cur.fetchone()
            if not row or not row[0]:
                print(f"{slug}: no airtable id — skipped"); return
            fields = get_record("📂 Clients", row[0])
            channel = fields.get("Slack Channel ID")
            if not channel:
                print(f"{slug}: no Slack Channel ID on the Airtable client — skipped"); return

            cur.execute("select max(ts) from slack_messages where channel_id=%s", (channel,))
            last_ts = (cur.fetchone() or [None])[0]

            msgs = slack.channel_history(channel, oldest=last_ts)
            ins = 0
            for m in msgs:
                if m.get("subtype") in SKIP_SUBTYPES:
                    continue
                text = _clean(m.get("text"))
                if len(text) < 3:
                    continue
                posted = datetime.fromtimestamp(float(m["ts"]), tz=timezone.utc)
                cur.execute(
                    """insert into slack_messages(client_slug, channel_id, ts, user_name, text, posted_at)
                       values(%s,%s,%s,%s,%s,%s) on conflict (channel_id, ts) do nothing""",
                    (slug, channel, m["ts"], m.get("user") or m.get("username"), text, posted),
                )
                ins += cur.rowcount
        conn.commit()
        n = embed_all(conn, only_tables={"slack_messages"})
        print(f"{slug}: slack messages inserted={ins}, embedded={n}")
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
