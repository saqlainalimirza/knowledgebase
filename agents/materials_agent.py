"""materials_agent.py - ingest client marketing materials into the memory.

Proposals, audits, scraped website info, brochures, pricing docs — anything that
gives context on WHO the client is and HOW they present themselves. Each material
is stored whole, then chunked (~1500 chars on paragraph boundaries) and embedded so
its content is semantically searchable alongside everything else.

The `context` field matters: it is the uploader saying what this document IS
("the audit deck they send after discovery calls") — it is prepended to every
chunk's search text so retrieval knows what it is reading.

Input file is JSON, one object or a list:
  { "client_slug": "scaletopia",        # required
    "title": "Outbound audit deck",     # required, unique per client (re-upload replaces)
    "material_type": "audit",           # proposal|audit|web_scrape|brochure|pricing|other
    "context": "sent to every prospect after the discovery call",
    "content": "...full text...",       # required
    "source_ref": "gdrive link etc" }

Usage:
  python materials_agent.py --file /path/to/payload.json
"""
import os
import re
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from shared.embed import embed_all

CHUNK_CHARS = 1500


def chunk_text(text):
    """Split on paragraph boundaries into ~CHUNK_CHARS pieces."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        if cur and len(cur) + len(p) + 2 > CHUNK_CHARS:
            chunks.append(cur)
            cur = p
        else:
            cur = f"{cur}\n\n{p}" if cur else p
        while len(cur) > CHUNK_CHARS * 2:  # single huge paragraph: hard split
            chunks.append(cur[:CHUNK_CHARS])
            cur = cur[CHUNK_CHARS:]
    if cur:
        chunks.append(cur)
    return chunks


def run(path):
    with open(path) as f:
        data = json.load(f)
    items = data if isinstance(data, list) else [data]
    conn = get_conn()
    try:
        saved, chunks_total = 0, 0
        with conn.cursor() as cur:
            for it in items:
                slug = (it.get("client_slug") or "").strip()
                title = (it.get("title") or "").strip()
                content = (it.get("content") or "").strip()
                if not (slug and title and content):
                    print(f"skipped: client_slug, title and content are required ({title or '?'})")
                    continue
                cur.execute("select 1 from client_roster where slug=%s", (slug,))
                if not cur.fetchone():
                    print(f"skipped '{title}': unknown client_slug '{slug}'")
                    continue
                mtype = (it.get("material_type") or "other").strip().lower()
                ctx = it.get("context")
                # re-upload with the same title replaces the old version
                cur.execute("delete from materials where client_slug=%s and title=%s", (slug, title))
                cur.execute(
                    """insert into materials(client_slug, title, material_type, context, content, source_ref)
                       values(%s,%s,%s,%s,%s,%s) returning id""",
                    (slug, title, mtype, ctx, content, it.get("source_ref")),
                )
                mid = cur.fetchone()[0]
                head = f"[{mtype}] {title}" + (f" — {ctx}" if ctx else "")
                for i, ch in enumerate(chunk_text(content)):
                    cur.execute(
                        """insert into material_chunks(material_id, client_slug, title, material_type,
                                                       context, chunk_index, chunk_text)
                           values(%s,%s,%s,%s,%s,%s,%s)""",
                        (mid, slug, title, mtype, ctx, i, f"{head}\n\n{ch}"),
                    )
                    chunks_total += 1
                saved += 1
        conn.commit()
        n = embed_all(conn, only_tables={"material_chunks"})
        print(json.dumps({"materials_saved": saved, "chunks": chunks_total, "embedded": n}))
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    args = ap.parse_args()
    run(args.file)
