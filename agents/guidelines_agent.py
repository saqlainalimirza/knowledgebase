"""guidelines_agent.py - persist copy/process guidelines into the memory.

The learning loop Claude lacks between sessions: when a strategist likes how a
session went ("save what I liked into Evergreen"), Claude posts the guidance here
and it persists — per client or global, any kind (preference, process, rule,
learning, do/don't). Next session, Claude pulls it back before writing.

Input file is JSON: one object or a list of objects:
  { "client_slug": "kynship" | null,   # null/absent = global, applies everywhere
    "kind": "preference",              # free-form: preference|process|rule|learning|...
    "guideline_text": "...",           # required
    "context": "from July 20 SMS session for X campaign",
    "source": "aaman" }

Duplicates (same client + same text) are skipped. Embeds immediately so the
guideline is searchable the moment it is saved.

Usage:
  python guidelines_agent.py --file /path/to/payload.json
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
                text = (it.get("guideline_text") or "").strip()
                if not text:
                    continue
                slug = it.get("client_slug") or None
                if slug:
                    cur.execute("select 1 from client_roster where slug=%s", (slug,))
                    if not cur.fetchone():
                        print(f"warning: unknown client_slug '{slug}' — saved as global")
                        slug = None
                cur.execute(
                    """select 1 from guidelines
                       where coalesce(client_slug,'') = coalesce(%s,'') and guideline_text = %s and active""",
                    (slug, text),
                )
                if cur.fetchone():
                    continue
                cur.execute(
                    """insert into guidelines(client_slug, kind, guideline_text, context, source)
                       values(%s,%s,%s,%s,%s)""",
                    (slug, (it.get("kind") or "preference").strip().lower(),
                     text, it.get("context"), it.get("source") or "aaman"),
                )
                ins += 1
        conn.commit()
        n = embed_all(conn, only_tables={"guidelines"})
        print(json.dumps({"saved": ins, "skipped_duplicates": len(items) - ins, "embedded": n}))
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    args = ap.parse_args()
    run(args.file)
