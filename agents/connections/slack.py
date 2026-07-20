"""Slack Web API access for the system (NOT the claude.ai connector).

Needs a bot token in SLACK_BOT_TOKEN. Create one at api.slack.com/apps:
  1. Create App -> From scratch -> pick the workspace.
  2. OAuth & Permissions -> Bot Token Scopes:
       channels:history  channels:read  groups:history  groups:read  chat:write
  3. Install to Workspace -> copy the xoxb-... token -> SLACK_BOT_TOKEN env.
  4. Invite the bot to each client channel:  /invite @<botname>
"""
import os
import time
import requests

import connections  # noqa: F401  (loads .env)

_API = "https://slack.com/api"


def _token():
    t = (os.environ.get("SLACK_BOT_TOKEN") or "").strip()
    if t.lower().startswith("bearer "):  # tolerate a pasted "Bearer xoxb-..." value
        t = t[7:].strip()
    if not t:
        raise RuntimeError("SLACK_BOT_TOKEN is not set. See connections/slack.py header for setup.")
    return t


def _call(method, **params):
    r = requests.post(f"{_API}/{method}",
                      headers={"Authorization": f"Bearer {_token()}"},
                      data=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"slack {method}: {data.get('error')}")
    return data


def enabled():
    return bool(os.environ.get("SLACK_BOT_TOKEN"))


def channel_history(channel_id, oldest=None, limit=200):
    """Yield messages (oldest first) since `oldest` ts. Handles pagination + rate limits."""
    cursor = None
    out = []
    while True:
        params = {"channel": channel_id, "limit": limit}
        if oldest:
            params["oldest"] = oldest
        if cursor:
            params["cursor"] = cursor
        try:
            data = _call("conversations.history", **params)
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 429:
                time.sleep(int(e.response.headers.get("Retry-After", 5)))
                continue
            raise
        out.extend(data.get("messages", []))
        cursor = (data.get("response_metadata") or {}).get("next_cursor")
        if not cursor:
            break
        time.sleep(1)
    out.reverse()  # oldest first
    return out


def post_message(channel_id, text):
    return _call("chat.postMessage", channel=channel_id, text=text)


def list_channels():
    """All channels the bot can see (public + private it's in). [{id, name, is_member}]"""
    chans, cursor = [], None
    for types in ("public_channel", "private_channel"):
        cursor = None
        while True:
            params = {"types": types, "limit": 999, "exclude_archived": "true"}
            if cursor:
                params["cursor"] = cursor
            try:
                data = _call("conversations.list", **params)
            except RuntimeError as e:
                if "missing_scope" in str(e):  # e.g. no groups:read yet
                    break
                raise
            chans.extend(data.get("channels", []))
            cursor = (data.get("response_metadata") or {}).get("next_cursor")
            if not cursor:
                break
    return [{"id": c["id"], "name": c["name"], "is_member": bool(c.get("is_member"))} for c in chans]
