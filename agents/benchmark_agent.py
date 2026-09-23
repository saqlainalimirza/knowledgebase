"""benchmark_agent.py — score a DRAFT copy against Evergreen's real winners & losers.

Given a draft (t1[/t2]) it embeds the draft once and finds the nearest WINNING and
nearest LOSING copies (with their real performance + why_it_worked/why_it_failed),
computes similarity, and returns a keep/rework/drop verdict. This is the routing step
the campaign-director fires on every draft: "ask the DB the right question" in one call,
so a draft that mirrors a known loser is caught before it ships.

Evergreen stays the PROVIDER — this returns evidence + a verdict, it does not write copy.

Usage:
  python benchmark_agent.py --client kynship --t1 "..." --t2 "..." --limit 4
"""
import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import embed_query

# cosine-similarity thresholds (score = 1 - distance; >0.75 is a strong match)
DROP_LIKE_LOSER = 0.88     # near-duplicate of a known loser -> drop
REWORK_LIKE_LOSER = 0.80   # clearly resembles a loser -> rework
KEEP_LIKE_WINNER = 0.80    # resembles a proven winner -> keep


def _fetch(cur, status, qvec, slug, niche, limit):
    # nearest copies of a given status, client + niche first then anywhere, with real perf.
    cur.execute(
        """select c.id, c.client_slug, c.t1, c.t2, c.lever, c.pattern, c.cta,
                  c.why_it_worked, c.why_it_failed,
                  1 - (c.full_copy_embedding <=> %s::vector) as score,
                  p.positive_rate, p.sent, p.positives, p.booked, p.power_rate,
                  (c.client_slug = %s) as same_client,
                  (c.niche is not distinct from %s) as same_niche
           from copies c
           left join copy_performance p on p.copy_id = c.id
           where c.full_copy_embedding is not null and c.status = %s
           order by c.full_copy_embedding <=> %s::vector
           limit %s""",
        (qvec, slug, niche, status, qvec, limit),
    )
    out = []
    for r in cur.fetchall():
        out.append({
            "id": r[0], "client_slug": r[1], "t1": r[2], "t2": r[3],
            "lever": r[4], "pattern": r[5], "cta": r[6],
            "why_it_worked": r[7], "why_it_failed": r[8],
            "score": round(float(r[9]), 4) if r[9] is not None else None,
            "positive_rate": float(r[10]) if r[10] is not None else None,
            "sent": r[11], "positives": r[12], "booked": r[13],
            "power_rate": float(r[14]) if r[14] is not None else None,
            "same_client": bool(r[15]), "same_niche": bool(r[16]),
        })
    return out


def run(client, t1, t2, limit=4):
    draft = "\n".join([x for x in [t1, t2] if x]).strip()
    if not draft:
        raise SystemExit("provide --t1 (and optionally --t2)")
    qvec = embed_query(draft)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            niche = None
            if client:
                cur.execute("select niche from client_roster where slug=%s", (client,))
                row = cur.fetchone()
                niche = row[0] if row else None
            winners = _fetch(cur, "winner", qvec, client, niche, limit)
            losers = _fetch(cur, "loser", qvec, client, niche, limit)

        sim_w = max([w["score"] for w in winners], default=0.0)
        sim_l = max([l["score"] for l in losers], default=0.0)
        near_l = losers[0] if losers else None
        near_w = winners[0] if winners else None

        # verdict — loser caution takes precedence, then winner resemblance, else novel
        if sim_l >= DROP_LIKE_LOSER:
            verdict, rec = "DROP", (
                f"~{round(sim_l*100)}% similar to a known loser"
                + (f" (why it failed: {near_l['why_it_failed']})" if near_l and near_l.get('why_it_failed') else "")
                + " — near-duplicate of something that already failed."
            )
        elif sim_l >= REWORK_LIKE_LOSER:
            verdict, rec = "REWORK", (
                f"~{round(sim_l*100)}% similar to a loser"
                + (f" (why it failed: {near_l['why_it_failed']})" if near_l and near_l.get('why_it_failed') else "")
                + " — change what it shares with that loser before shipping."
            )
        elif sim_w >= KEEP_LIKE_WINNER:
            rate = f"{near_w['positive_rate']}" if near_w and near_w.get("positive_rate") is not None else "n/a"
            verdict, rec = "KEEP", (
                f"~{round(sim_w*100)}% similar to a proven winner"
                + (f" (positive_rate {rate})" if rate != "n/a" else "")
                + " — leans on something that already works."
            )
        else:
            verdict, rec = "TEST", (
                "no strong match to a known winner or loser — genuinely novel, worth testing "
                "but unproven."
            )

        print(json.dumps({
            "client": client, "draft": {"t1": t1, "t2": t2},
            "similarity_to_winner": round(sim_w, 4),
            "similarity_to_loser": round(sim_l, 4),
            "verdict": verdict, "recommendation": rec,
            "nearest_winner": near_w, "nearest_loser": near_l,
            "winners": winners, "losers": losers,
        }, default=str))
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", default=None)
    ap.add_argument("--t1", required=True)
    ap.add_argument("--t2", default=None)
    ap.add_argument("--limit", type=int, default=4)
    args = ap.parse_args()
    run(args.client, args.t1, args.t2, args.limit)
