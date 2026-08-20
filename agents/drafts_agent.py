"""drafts_agent.py - save client research/draft notes into the memory.

A scratchpad per client (including clients NOT yet onboarded, e.g. Acceler8, Strike
Tax, Taktical) so GTM work can start before the full transcript/pain ingestion exists.
Holds research, ICP notes, angles, draft copy, working notes — embedded so it's
searchable alongside everything else. Unlike guidelines (copy RULES) or materials
(the client's OWN docs), drafts are YOUR working intelligence about the client.

Input file is JSON, one object or a list:
  { "client_slug": "acceler8",   # required (need not exist in the roster)
    "kind": "research",          # research | icp | angle | draft_copy | note
    "title": "First-pass ICP",   # optional
    "content": "...",            # required
    "source": "aaman" }

Usage:
  python drafts_agent.py --file /path/to/payload.json
"""
import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from shared.embed import embed_all


def run(path):
    with open(path) as f:
        data = json.load(f)
    items = data if isinstance(data, list) else [data]
    conn = get_conn()
    try:
        ins = 0
        with conn.cursor() as cur:
            for it in items:
                slug = (it.get("client_slug") or "").strip()
                content = (it.get("content") or "").strip()
                if not (slug and content):
                    print(f"skipped: client_slug and content required")
                    continue
                cur.execute(
                    """insert into client_drafts(client_slug, kind, title, content, source)
                       values(%s,%s,%s,%s,%s)""",
                    (slug, (it.get("kind") or "research").strip().lower(),
                     it.get("title"), content, it.get("source") or "aaman"),
                )
                ins += 1
        conn.commit()
        n = embed_all(conn, only_tables={"client_drafts"})
        print(json.dumps({"saved": ins, "embedded": n}))
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    args = ap.parse_args()
    run(args.file)
