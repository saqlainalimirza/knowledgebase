"""slack_sync_agent.py - ingest each client's Slack channel into the memory.

Finds each client's channel automatically: any channel the bot is a member of
whose name contains the client slug or client name (e.g. #kynship, #client-kynship,
#scaletopia-kynship). An Airtable field "Slack Channel ID" on the 📂 Clients record
overrides discovery if present. Pulls new messages since the last sync,
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


def _norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def find_channel(slug, client_name=None, channels=None):
    """Best member-channel whose name contains the slug or client name."""
    channels = channels if channels is not None else slack.list_channels()
    nslug, nname = _norm(slug), _norm(client_name)
    best = None
    for c in channels:
        cn = _norm(c["name"])
        # "scaletopia" prefixes every agency channel — that client needs an exact name
        if nslug == "scaletopia":
            if cn == nslug:
                return c
            continue
        if (nslug and nslug in cn) or (nname and len(nname) > 3 and nname in cn):
            # prefer the shortest matching name (most specific: #kynship over #kynship-archive-2024)
            if best is None or len(c["name"]) < len(best["name"]):
                best = c
    return best


def sync(slug, channels=None):
    if not slack.enabled():
        print(f"{slug}: SLACK_BOT_TOKEN not set — skipped (see connections/slack.py)")
        return
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select client, airtable_client_id from client_roster where slug=%s", (slug,))
            row = cur.fetchone()
            if not row:
                print(f"{slug}: not in roster — skipped"); return
            client_name, at_id = row
            channel = None
            if at_id:  # optional Airtable override
                try:
                    channel = get_record("📂 Clients", at_id).get("Slack Channel ID")
                except Exception:
                    pass
            if not channel:
                hit = find_channel(slug, client_name, channels)
                if hit:
                    if not hit["is_member"]:  # public channel: join ourselves (private needs /invite)
                        try:
                            slack.join_channel(hit["id"])
                        except Exception as e:
                            print(f"{slug}: found #{hit['name']} but can't join ({e}) — skipped"); return
                    channel = hit["id"]
                    print(f"{slug}: matched channel #{hit['name']} ({channel})")
            if not channel:
                print(f"{slug}: no Slack channel found (invite the bot to the client's channel) — skipped"); return

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
        chans = slack.list_channels() if slack.enabled() else None
        for s in slugs:
            try:
                sync(s, channels=chans)
            except Exception as e:
                print(f"{s}: ERR {e}")
    elif args.client:
        sync(args.client)
    else:
        raise SystemExit("pass --client or --all")
