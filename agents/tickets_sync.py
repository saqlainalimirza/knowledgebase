"""tickets_sync.py - copy bug messages from the Slack bugs channel into bug_tickets.

NO AI. Slack already gives the text, poster, timestamp and permalink; this just
mirrors each message into a ticket card (dedup on the Slack message ts). Backs up
the real-time Slack Events endpoint: runs on the daily sync and from the
"Sync bugs now" button, so nothing is ever missed.

Usage:
  python tickets_sync.py
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections import slack

BUGS_CHANNEL = os.environ.get("BUGS_CHANNEL_ID", "C0890LFFRAB")
SKIP_SUBTYPES = {"channel_join", "channel_leave", "bot_message", "thread_broadcast"}


def sync():
    if not slack.enabled():
        print("SLACK_BOT_TOKEN not set — skipped")
        return 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select max(slack_ts) from bug_tickets where slack_channel_id=%s", (BUGS_CHANNEL,))
            last_ts = (cur.fetchone() or [None])[0]

        # make sure the bot is in the channel (public -> auto-join)
        try:
            slack.join_channel(BUGS_CHANNEL)
        except Exception:
            pass

        msgs = slack.channel_history(BUGS_CHANNEL, oldest=last_ts)
        ins = 0
        for m in msgs:
            if m.get("subtype") in SKIP_SUBTYPES or m.get("bot_id"):
                continue
            text = (m.get("text") or "").strip()
            if not text:
                continue
            day = datetime.fromtimestamp(float(m["ts"]), tz=timezone.utc).date()
            link = slack.permalink(BUGS_CHANNEL, m["ts"])
            with conn.cursor() as cur:
                cur.execute(
                    """insert into bug_tickets(slack_ts, slack_channel_id, reporter, permalink, text, day)
                       values(%s,%s,%s,%s,%s,%s) on conflict (slack_ts) do nothing""",
                    (m["ts"], BUGS_CHANNEL, m.get("user") or m.get("username"), link, text, day),
                )
                ins += cur.rowcount
            conn.commit()
        print(f"bug tickets: inserted {ins}")
        return ins
    finally:
        conn.close()


if __name__ == "__main__":
    sync()
