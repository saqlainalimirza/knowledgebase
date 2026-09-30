"""loser_seed_agent.py — grow the loser corpus from real dead-campaign performance.

The benchmark gate (/api/benchmark-copy) is only as good as the loser corpus. With only the
handful of hand-labelled losers, a genuinely bad new angle isn't caught (it matches nothing).
This labels the copies of clearly-dead campaigns as losers so the benchmark has real exemplars.

A campaign is "dead" (its copies -> loser) when, from the deduped campaign_rollup:
  - sent >= MIN_SENT           (enough volume to trust)
  - booked = 0                 (no meetings at all)
  - positive_replies / sent < POS_FLOOR   (~0 positive-per-send)

Guards (never mislabel): only touches copies with status in ('draft','neutral') — it never
overrides a winner or a manually/A-B-set label (status_source is left 'manual' for those).
Idempotent: once set to 'loser' a copy drops out of the draft/neutral filter, so re-runs are safe.

Usage:  python loser_seed_agent.py --client kynship   |   --all
"""
import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn

MIN_SENT = 800
POS_FLOOR = 0.0015   # 0.15% positive-per-send
WINNER_SIM = 0.88    # don't seed a "loser" whose shape is >=this similar to a known winner


def run(slug):
    conn = get_conn()
    n = 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                """select name, sent, positive_replies
                   from campaign_rollup
                   where client_slug = %s and sent >= %s and coalesce(booked,0) = 0
                     and positive_replies::numeric / nullif(sent,0) < %s""",
                (slug, MIN_SENT, POS_FLOOR),
            )
            dead = cur.fetchall()
            for name, sent, pos in dead:
                rate = round(100.0 * (pos or 0) / sent, 3) if sent else 0
                why = (f"auto (dead campaign): {pos or 0} positives on {sent} sent "
                       f"({rate}%), 0 meetings booked")
                # CRITICAL guard: never label a copy a loser if its SHAPE matches a known
                # winner (>=WINNER_SIM). A dead campaign that ran a proven winning shape died
                # from list/targeting, not the copy - labeling it poisons the benchmark corpus
                # (it then flags the winning shape as a loser). "Presence in a loser is not guilt."
                cur.execute(
                    """update copies co
                       set status='loser', status_source='auto', status_labeled_at=now(),
                           why_it_failed=%s
                       from campaigns ca
                       where co.campaign_id = ca.id and ca.client_slug = %s and ca.name = %s
                         and co.full_copy_embedding is not null
                         and co.status in ('draft','neutral')
                         and not exists (
                           select 1 from copies wi
                           where wi.status='winner' and wi.full_copy_embedding is not null
                             and 1 - (wi.full_copy_embedding <=> co.full_copy_embedding) >= %s)
                       returning co.id""",
                    (why, slug, name, WINNER_SIM),
                )
                n += len(cur.fetchall())
        conn.commit()
    finally:
        conn.close()
    print(f"{slug}: seeded {n} losers from {len(dead)} dead campaigns")
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        # every client that has campaigns, incl. past copy-only clients (velox, dma, …):
        # a dead angle is dead evidence regardless of client status.
        cur.execute("select distinct client_slug from campaign_rollup order by client_slug")
        slugs = [r[0] for r in cur.fetchall()]; conn.close()
        for s in slugs:
            try: run(s)
            except Exception as e: print(f"{s}: ERR {e}")
    elif args.client:
        run(args.client)
    else:
        raise SystemExit("pass --client or --all")
