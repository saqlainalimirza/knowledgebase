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
# Only skip true noise. Bot-posted messages (Airtable Automation Error, Threat Lead
# alerts, etc.) ARE the bugs in this channel, so they are kept.
SKIP_SUBTYPES = {"channel_join", "channel_leave", "channel_topic", "channel_purpose"}


def _extract_text(m):
    """Pull readable text from a bot message that uses attachments/blocks instead of text."""
    parts = []
    for a in m.get("attachments", []) or []:
        for k in ("fallback", "pretext", "title", "text"):
            if a.get(k):
                parts.append(str(a[k]))
    for b in m.get("blocks", []) or []:
        t = b.get("text")
        if isinstance(t, dict) and t.get("text"):
            parts.append(str(t["text"]))
        for f in b.get("fields", []) or []:
            if isinstance(f, dict) and f.get("text"):
                parts.append(str(f["text"]))
    # dedup while keeping order
    seen, out = set(), []
    for p in parts:
        p = p.strip()
        if p and p not in seen:
            seen.add(p); out.append(p)
    return "\n".join(out).strip()


def _bot_name(m):
    return (m.get("bot_profile") or {}).get("name") or m.get("username") or "bot"


def sync():
    if not slack.enabled():
        print("SLACK_BOT_TOKEN not set — skipped")
        return 0
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select max(slack_ts) from bug_tickets where slack_channel_id=%s", (BUGS_CHANNEL,))
            last_ts = (cur.fetchone() or [None])[0]
            # "from now on" floor: never pull messages older than this, even when the
            # board is empty (so we don't re-backfill the old channel history).
            cur.execute("select v from bug_ticket_state where k='floor_ts'")
            floor = (cur.fetchone() or [None])[0]
        # oldest = the later of the floor and the newest ticket we already have
        oldest = max([t for t in (last_ts, floor) if t], default=None)

        # make sure the bot is in the channel (public -> auto-join)
        try:
            slack.join_channel(BUGS_CHANNEL)
        except Exception:
            pass

        msgs = slack.channel_history(BUGS_CHANNEL, oldest=oldest)
        base = slack.team_url()  # built once; permalinks constructed locally (no per-msg API call)
        ins = 0
        for start in range(0, len(msgs), 200):
            with conn.cursor() as cur:
                for m in msgs[start:start + 200]:
                    if m.get("subtype") in SKIP_SUBTYPES:
                        continue
                    text = (m.get("text") or "").strip()
                    # bot alerts often put content in attachments/blocks, not `text`
                    if not text:
                        text = _extract_text(m)
                    if not text:
                        continue
                    reporter = m.get("user") or m.get("username") or _bot_name(m)
                    day = datetime.fromtimestamp(float(m["ts"]), tz=timezone.utc).date()
                    link = slack.build_permalink(BUGS_CHANNEL, m["ts"], base)
                    cur.execute(
                        """insert into bug_tickets(slack_ts, slack_channel_id, reporter, permalink, text, day)
                           values(%s,%s,%s,%s,%s,%s) on conflict (slack_ts) do nothing""",
                        (m["ts"], BUGS_CHANNEL, reporter, link, text, day),
                    )
                    ins += cur.rowcount
            conn.commit()
        print(f"bug tickets: inserted {ins}")
        return ins
    finally:
        conn.close()


if __name__ == "__main__":
    sync()
