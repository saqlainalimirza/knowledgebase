"""learnings_agent.py — turn real A/B performance into durable, structured learnings,
and (conservatively) auto-label the copies that won/lost.

Reads variant-performance (the significance-gated authority: derived_variant, MIN_CONFIDENT_REACH,
the 8%/floor-20 collapse) per campaign and:
  1. writes a structured LEARNING ("variant V2 beat V1: X% vs Y% on Nv N, ok") the brief consumes,
     richer than the blunt winner/loser flag — carries the numbers, confidence and an implicit action.
  2. best-effort AUTO-LABELS the winning/losing copy (copies.status), guarded by status_source so it
     never clobbers a human label, and only when the arm maps confidently to a campaign copy. This
     closes the loop niche_synth already depends on (it pulls status='winner').

Hybrid confidence (per the product decision): confidence 'ok' -> learning 'confirmed' + auto-label;
'directional' -> learning 'proposed' (needs a human ok), no auto-label.

Usage:
  python learnings_agent.py --client kynship
  python learnings_agent.py --all
"""
import os
import re
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import embed_query
from shared.embed import embed_all

POSITIVE = ['positive', 'power request', 'meeting booked', 'more info request',
            'email me request', 'maybe', 'referral request']
MIN_CONFIDENT_REACH = 50   # mirror variant-performance route
MIN_DELTA_PP = 1.0         # ignore arms that are effectively tied
MAP_SIM = 0.80             # how close an arm's opener must be to a copy to auto-label it


def _snippet(text, n=90):
    """A short, CLEAN opener snippet from a conversation sample — strips the send-log
    wrapper 'Outbound - <date>, <Client> said: <opener>' so the real first line survives."""
    s = " ".join((text or "").split())
    m = re.search(r'\bsaid:\s*(.+)', s)          # "... said: <opener>"  (the log wrapper)
    if m:
        s = m.group(1).strip()
    elif ":" in s[:18]:                           # or a bare "Speaker:" label
        s = s.split(":", 1)[1].strip()
    return (s[:n] + "…") if len(s) > n else s


def _variant_perf(cur, slug, campaign_name):
    """Port of GET /api/clients/{slug}/variant-performance for one campaign."""
    cur.execute(
        """select ct.derived_variant as variant,
                  count(*)::int as reached,
                  count(*) filter (where lower(coalesce(ct.lead_category,'')) = any(%s))::int as positives,
                  (array_agg(left(ct.conversation, 240) order by ct.id))[1] as sample
           from contacts ct join campaigns ca on ca.id = ct.db_campaign_id
           where ct.client_slug = %s and ca.name = %s and ct.derived_variant is not null
           group by ct.derived_variant""",
        (POSITIVE, slug, campaign_name),
    )
    rows = [{"variant": r[0], "reached": r[1], "positives": r[2], "sample": r[3] or "",
             "rate": (round(r[2] / r[1] * 1000) / 10 if r[1] else 0.0)} for r in cur.fetchall()]
    if not rows:
        return None
    total = sum(r["reached"] for r in rows)
    floor = max(20, round(total * 0.08))
    variants = sorted([r for r in rows if r["reached"] >= floor], key=lambda r: r["rate"], reverse=True)
    if len(variants) < 2:
        return None
    min_arm = min(v["reached"] for v in variants)
    confidence = "directional" if min_arm < MIN_CONFIDENT_REACH else "ok"
    return {"winner": variants[0], "loser": variants[-1], "confidence": confidence}


def _upsert_learning(cur, slug, cid, winner, loser, delta, conf, statement, evidence):
    status = "confirmed" if conf == "ok" else "proposed"
    cur.execute(
        """insert into learnings
             (client_slug, campaign_id, dimension, winner_value, loser_value, metric,
              winner_n, loser_n, delta_pp, confidence, status, statement, evidence,
              source, active, embedding, refreshed_at, updated_at)
           values (%s,%s,'variant',%s,%s,'reply_positive_rate',%s,%s,%s,%s,%s,%s,%s::jsonb,
                   'auto',true,null,now(),now())
           on conflict (client_slug, coalesce(campaign_id,0), dimension,
                        coalesce(winner_value,''), coalesce(loser_value,''))
           do update set winner_n=excluded.winner_n, loser_n=excluded.loser_n,
             delta_pp=excluded.delta_pp, confidence=excluded.confidence,
             -- never downgrade a learning a human already confirmed
             status = case when learnings.status='confirmed' then 'confirmed' else excluded.status end,
             statement=excluded.statement, evidence=excluded.evidence,
             active=true, embedding=null, refreshed_at=now(), updated_at=now()""",
        (slug, cid, winner["variant"], loser["variant"], winner["reached"], loser["reached"],
         delta, conf, status, statement, json.dumps(evidence)),
    )


def _nearest_copy(cur, ids, vec):
    cur.execute(
        """select id, status_source, 1 - (t1_embedding <=> %s::vector) as s
           from copies where campaign_id = any(%s) and t1_embedding is not null
           order by t1_embedding <=> %s::vector limit 1""",
        (vec, ids, vec),
    )
    return cur.fetchone()


def _auto_label(cur, ids, winner, loser):
    """Only on confident campaigns: map each arm's opener to a campaign copy and flip
    status, never overwriting a manual label, only on a strong (>=MAP_SIM) unambiguous match.
    `ids` = every campaign row sharing this campaign name (copies link to any of them)."""
    cur.execute("select count(*) from copies where campaign_id = any(%s) and t1_embedding is not null", (ids,))
    if (cur.fetchone()[0] or 0) < 2:
        return 0
    wn = _nearest_copy(cur, ids, embed_query(winner["sample"])) if winner["sample"] else None
    ln = _nearest_copy(cur, ids, embed_query(loser["sample"])) if loser["sample"] else None
    if not wn or not ln or wn[0] == ln[0]:
        return 0
    n = 0
    if wn[2] >= MAP_SIM and wn[1] != "manual":
        cur.execute(
            "update copies set status='winner', status_source='auto', status_labeled_at=now(), "
            "why_it_worked=%s where id=%s",
            (f"auto: won its A/B — variant {winner['variant']} {winner['rate']}% positive "
             f"on {winner['reached']} reached", wn[0]),
        )
        n += 1
    if ln[2] >= MAP_SIM and ln[1] != "manual":
        cur.execute(
            "update copies set status='loser', status_source='auto', status_labeled_at=now(), "
            "why_it_failed=%s where id=%s",
            (f"auto: lost its A/B — variant {loser['variant']} {loser['rate']}% positive "
             f"on {loser['reached']} reached", ln[0]),
        )
        n += 1
    return n


def run(slug):
    conn = get_conn()
    n_learn = n_label = 0
    try:
        with conn.cursor() as cur:
            # dedupe same-name campaign records (Airtable keeps many rows per logical campaign);
            # variant-performance groups by name, so one learning per NAME, keyed to a stable id.
            cur.execute("select min(id) as id, array_agg(id) as ids, name from campaigns "
                        "where client_slug=%s and name is not null group by name", (slug,))
            campaigns = cur.fetchall()
            for cid, ids, name in campaigns:
                vp = _variant_perf(cur, slug, name)
                if not vp:
                    continue
                w, l, conf = vp["winner"], vp["loser"], vp["confidence"]
                delta = round(w["rate"] - l["rate"], 1)
                if delta < MIN_DELTA_PP:
                    continue
                win_opener = _snippet(w["sample"])
                # IMPORTANT: this rate is positives / REPLIERS (reply quality), NOT / sends.
                # variant-performance attributes only leads that replied, so it can't give a
                # send-based rate. Label it plainly so a 62%-of-repliers is never read as a
                # 62% send rate (the real send-based positive rate is a fraction of a percent).
                statement = (f"{name}: variant {w['variant']} beat {l['variant']} on reply quality — "
                             f"{w['rate']}% vs {l['rate']}% of REPLIES were positive "
                             f"({w['reached']} vs {l['reached']} repliers), {conf}. "
                             f"(reply-quality, not a send rate)"
                             + (f' Winning opener: "{win_opener}"' if win_opener else ""))
                evidence = {"campaign": name, "winner": w["variant"], "loser": l["variant"],
                            "source": "variant-performance", "winning_opener": win_opener}
                _upsert_learning(cur, slug, cid, w, l, delta, conf, statement, evidence)
                n_learn += 1
                if conf == "ok":
                    try:
                        n_label += _auto_label(cur, ids, w, l)
                    except Exception as e:
                        print(f"  auto-label skip ({name}): {e}")
        conn.commit()
        embed_all(conn, only_tables={"learnings"})
    finally:
        conn.close()
    print(f"{slug}: {n_learn} learnings, {n_label} copies auto-labeled")
    return n_learn


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select slug from client_roster where status='active' order by slug")
        slugs = [r[0] for r in cur.fetchall()]; conn.close()
        for s in slugs:
            try: run(s)
            except Exception as e: print(f"{s}: ERR {e}")
    elif args.client:
        run(args.client)
    else:
        raise SystemExit("pass --client or --all")
