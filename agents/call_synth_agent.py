"""call_synth_agent.py — whole-call insight synthesis per client.

The fix for "call search only returns chunks near the queries I thought to ask." Instead of
retrieving snippets by query, this reads a client's FULL transcripts in one pass and extracts
comprehensively: the buyer's terminology, the angles that landed, objections, pains, dream
outcomes and notable verbatim quotes. So discovery stops depending on guessing queries.

Modelled on niche_synth_agent.py: gather -> one extract_json call -> upsert -> embed.
Evergreen stays the PROVIDER — it surfaces what's in the calls; it doesn't write copy.

Usage:  python call_synth_agent.py --client kynship   |   --all
"""
import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import extract_json
from shared.embed import embed_all

CHAR_BUDGET = 400_000   # ~100k tokens; covers ~8-15 full calls, caps cost/latency
REQUIRED_KEYS = {"terminology", "angles", "objections", "pains", "dream_outcomes",
                 "notable_quotes", "summary"}

SYNTH_PROMPT = """You are reading the FULL sales-call transcripts for one Scaletopia client
({client}). Read the ENTIRE calls below — do NOT just skim for keywords. Your job is
comprehensive discovery: surface what is actually in these calls, not only what someone might
search for.

Extract, grounded ONLY in what is actually said (never invent):
- terminology: the buyer's own words, phrases and jargon — how THEY talk about their world,
  their metrics, their problems (verbatim words where possible).
- angles: framings, hooks or value-props the prospect responded well to, got curious about, or
  that clearly landed. Note briefly why each seemed to work.
- objections: concerns, hesitations and pushback raised (and how they were framed).
- pains: the real problems expressed (in their words).
- dream_outcomes: what success / the ideal outcome looks like to them.
- notable_quotes: 5-12 high-signal verbatim lines, each with the speaker if identifiable.

Return STRICT JSON, arrays of short strings (notable_quotes may be "speaker: quote"):
{{
  "terminology": [], "angles": [], "objections": [], "pains": [],
  "dream_outcomes": [], "notable_quotes": [],
  "summary": "2-4 sentences: who the buyer is and what these calls reveal"
}}

Be comprehensive and specific. If the calls are thin, return what's there and keep arrays short.

TRANSCRIPTS:
---
{transcripts}
---"""


def gather(cur, slug):
    cur.execute(
        """select source_call_id, title, raw_transcript
           from client_calls
           where client_slug=%s and raw_transcript is not null and length(raw_transcript) > 400
           order by call_date desc nulls last, id desc""",
        (slug,),
    )
    used, total, blocks = [], 0, []
    for scid, title, tx in cur.fetchall():
        if total >= CHAR_BUDGET:
            break
        take = tx[: max(0, CHAR_BUDGET - total)]
        blocks.append(f"### CALL: {title or scid} ({scid})\n{take}")
        used.append(scid)
        total += len(take)
    return used, "\n\n".join(blocks)


def upsert_call_insights(cur, slug, result, call_ids):
    cur.execute(
        """insert into call_insights
             (client_slug, terminology, angles, objections, pains, dream_outcomes,
              notable_quotes, summary, n_calls, source_call_ids, embedding, refreshed_at, updated_at)
           values (%s,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s,%s::jsonb,
                   null, now(), now())
           on conflict (client_slug) do update set
             terminology=excluded.terminology, angles=excluded.angles,
             objections=excluded.objections, pains=excluded.pains,
             dream_outcomes=excluded.dream_outcomes, notable_quotes=excluded.notable_quotes,
             summary=excluded.summary, n_calls=excluded.n_calls,
             source_call_ids=excluded.source_call_ids, embedding=null,
             refreshed_at=now(), updated_at=now()""",
        (slug,
         json.dumps(result.get("terminology", [])), json.dumps(result.get("angles", [])),
         json.dumps(result.get("objections", [])), json.dumps(result.get("pains", [])),
         json.dumps(result.get("dream_outcomes", [])), json.dumps(result.get("notable_quotes", [])),
         result.get("summary", ""), len(call_ids), json.dumps(call_ids)),
    )


def run(slug):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            call_ids, transcripts = gather(cur, slug)
        if not call_ids:
            print(f"{slug}: no transcripts to synthesize")
            return 0
        result = extract_json(SYNTH_PROMPT.format(client=slug, transcripts=transcripts))
        missing = REQUIRED_KEYS - set(result)
        if missing:
            for k in missing:
                result[k] = [] if k != "summary" else ""
        with conn.cursor() as cur:
            upsert_call_insights(cur, slug, result, call_ids)
        conn.commit()
        embed_all(conn, only_tables={"call_insights"})
    finally:
        conn.close()
    print(f"{slug}: synthesized call insights from {len(call_ids)} calls")
    return len(call_ids)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select distinct client_slug from client_calls where raw_transcript is not null")
        slugs = [r[0] for r in cur.fetchall()]; conn.close()
        for s in slugs:
            try: run(s)
            except Exception as e: print(f"{s}: ERR {e}")
    elif args.client:
        run(args.client)
    else:
        raise SystemExit("pass --client or --all")
