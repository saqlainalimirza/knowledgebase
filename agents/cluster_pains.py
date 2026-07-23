"""cluster_pains.py - show which pains actually group together by meaning.

Loads pains (with their Gemini embeddings) for a niche or client and runs the SAME
greedy cosine clustering niche_synth uses (threshold 0.82 by default). Prints JSON
clusters with their real member texts, so you can SEE which of the N pains are
near-duplicates and which are unique.

Usage:
  python cluster_pains.py --niche "DTC ecom"
  python cluster_pains.py --client chamber_media --threshold 0.85
"""
import os
import sys
import json
import argparse

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from shared.taxonomy import _to_vec


def greedy_cluster(items, threshold):
    """items: list of dicts with 'vec' (L2-normalized). Greedy: each item joins the
    first existing cluster whose seed it is >= threshold similar to, else starts one."""
    vecs = [_to_vec(it["vec"]) for it in items]
    used = [False] * len(items)
    clusters = []
    for i in range(len(items)):
        if used[i]:
            continue
        group = [i]
        used[i] = True
        for j in range(i + 1, len(items)):
            if used[j]:
                continue
            sim = float(np.dot(vecs[i], vecs[j]))  # normalized -> dot == cosine
            if sim >= threshold:
                group.append(j)
                used[j] = True
        clusters.append(group)
    return clusters


def run(niche, client, threshold, limit):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if niche:
                cur.execute(
                    """select id, client_slug, kind, item_text, confidence, embedding
                       from master_sheet_pains where niche=%s and embedding is not null""",
                    (niche,),
                )
            else:
                cur.execute(
                    """select id, client_slug, kind, item_text, confidence, embedding
                       from master_sheet_pains where client_slug=%s and embedding is not null""",
                    (client,),
                )
            rows = cur.fetchall()

        items = [
            {"id": r[0], "client": r[1], "kind": r[2], "text": r[3], "confidence": r[4], "vec": r[5]}
            for r in rows
        ]
        groups = greedy_cluster(items, threshold)

        clusters = []
        for g in groups:
            members = [items[i] for i in g]
            clients = sorted({m["client"] for m in members})
            clusters.append({
                "representative": members[0]["text"],
                "size": len(members),
                "client_count": len(clients),
                "clients": clients,
                "kinds": sorted({m["kind"] for m in members}),
                "members": [
                    {"id": m["id"], "text": m["text"], "kind": m["kind"],
                     "client": m["client"], "confidence": m["confidence"]}
                    for m in members
                ],
            })
        clusters.sort(key=lambda c: c["size"], reverse=True)
        # stats over ALL clusters (before any limit), so the summary is honest
        multi = sum(1 for c in clusters if c["size"] > 1)
        singletons = sum(1 for c in clusters if c["size"] == 1)
        if limit:
            clusters = clusters[:limit]

        print(json.dumps({
            "scope": niche or client,
            "threshold": threshold,
            "total_pains": len(items),
            "clusters_total": len(groups),
            "multi_member_clusters": multi,
            "singletons": singletons,
            "shown": len(clusters),
            "clusters": clusters,
        }, default=str))
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--niche", default=None)
    ap.add_argument("--client", default=None)
    ap.add_argument("--threshold", type=float, default=0.82)
    ap.add_argument("--limit", type=int, default=0, help="max clusters to return (0 = all)")
    args = ap.parse_args()
    if not args.niche and not args.client:
        raise SystemExit("pass --niche or --client")
    run(args.niche, args.client, args.threshold, args.limit)
