"""remine_from_chunks.py - re-mine pains for calls already ingested as chunks.

Use after the taxonomy pgvector fix: calls ingested with mine:false have chunks
but no extracted pains. This reconstructs each call's transcript from its stored
chunks, mines pains with Gemini, and commits per-call (so a slow/failed call
never loses the others).

Usage:
  python remine_from_chunks.py --client scaletopia
"""
import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import extract_json
from transcript_agent import MINE_PROMPT, SYSTEM
from shared.writers import upsert_pain
from shared.taxonomy import tag_client_and_inherit
from shared.embed import embed_all


def run(client):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("select niche from client_roster where slug=%s", (client,))
            row = cur.fetchone()
            niche = row[0] if row else None
            cur.execute(
                "select id, source_call_id from client_calls where client_slug=%s order by id", (client,))
            calls = cur.fetchall()
        print(f"{client}: {len(calls)} calls to re-mine (niche={niche})", flush=True)

        grand = {"inserted": 0, "upgraded": 0, "skipped": 0}
        for call_id, src in calls:
            with conn.cursor() as cur:
                cur.execute("select chunk_text from call_chunks where call_id=%s order by chunk_index", (call_id,))
                transcript = "\n".join(r[0] for r in cur.fetchall())
            if not transcript.strip():
                print(f"  call {call_id} {src}: no chunks, skipped", flush=True)
                continue
            try:
                data = extract_json(MINE_PROMPT.format(transcript=transcript), system=SYSTEM)
            except Exception as e:
                print(f"  call {call_id} {src}: mine FAILED {e}", flush=True)
                continue
            pains = data.get("pains", [])
            counts = {"inserted": 0, "upgraded": 0, "skipped": 0}
            with conn.cursor() as cur:
                for p in pains:
                    p["source"] = f"call {src}"
                    try:
                        counts[upsert_pain(cur, p, client, niche, None)] += 1
                    except ValueError:
                        counts["skipped"] += 1
            conn.commit()
            for k in grand:
                grand[k] += counts[k]
            print(f"  call {call_id} {src}: {len(pains)} mined -> {counts}", flush=True)

        with conn.cursor() as cur:
            tag_client_and_inherit(cur, client, niche_text=niche)
        conn.commit()
        n = embed_all(conn, only_tables={"master_sheet_pains"})
        print(f"{client}: DONE {grand}, embedded {n}", flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    args = ap.parse_args()
    run(args.client)
