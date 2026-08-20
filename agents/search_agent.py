"""search_agent.py - semantic search over the Evergreen memory.

Embeds the query with Gemini (RETRIEVAL_QUERY) and runs pgvector cosine search
against the chosen content type. Prints JSON results. Used by the frontend search
page and usable from the CLI.

Types:
  pains        -> master_sheet_pains.embedding (item_text)
  calls        -> call_chunks.embedding (chunk_text)
  case_studies -> case_studies.result_embedding (after_state + notable_results)
  copies       -> copies.full_copy_embedding (t1 + t2)  [+ real positive_rate]
  components   -> copy_components.embedding (item_text)

Usage:
  python search_agent.py --type pains --query "rising CAC on meta" --niche "DTC ecom" --limit 10
"""
import os
import sys
import json
import math
import argparse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import embed_query

# ---- weighting knobs ----
RECENCY_HALF_LIFE_DAYS = 180   # copies: recency halves every ~6 months (they age fast)
PAIN_HALF_LIFE_DAYS = 540      # pains/proof age slower — recency is a mild tiebreaker
UNPROVEN_PRIOR = 0.30          # performance score for copies with no metrics yet
AGED_DAYS = 365               # older than this → flagged so the skill modernizes it
WILSON_Z = 1.0                # confidence bound tightness

CONF_FACTOR = {"confirmed": 1.0, "needs_more": 0.8}
TIER_FACTOR = {"S": 1.0, "A": 0.85, "B": 0.7, "C": 0.5, "D": 0.35}


def _recency(created, half_life_days):
    """Time-decay 0..1 from a created_at value. Returns (recency, age_days)."""
    if not created:
        return 1.0, None
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            return 1.0, None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    age = max(0.0, (datetime.now(timezone.utc) - created).total_seconds() / 86400)
    return 0.5 ** (age / half_life_days), age


def weight_pains(rows):
    """Rank pains by relevance × confidence × recency (confidence dominates; recency mild)."""
    for r in rows:
        rec, _ = _recency(r.get("created_at"), PAIN_HALF_LIFE_DAYS)
        conf = CONF_FACTOR.get(r.get("confidence"), 0.8)
        r["recency"] = round(rec, 4)
        r["weight"] = round((r.get("score") or 0.0) * conf * rec, 5)
    rows.sort(key=lambda r: r.get("weight", 0), reverse=True)
    return rows


def weight_cases(rows):
    """Rank case studies by relevance × tier × recency (tier dominates; recency mild)."""
    for r in rows:
        rec, _ = _recency(r.get("created_at"), PAIN_HALF_LIFE_DAYS)
        tier = TIER_FACTOR.get((r.get("tier") or "").strip().upper(), 0.5)
        r["recency"] = round(rec, 4)
        r["weight"] = round((r.get("score") or 0.0) * tier * rec, 5)
    rows.sort(key=lambda r: r.get("weight", 0), reverse=True)
    return rows


def _wilson(k, n, z=WILSON_Z):
    """Lower confidence bound of a rate k/n — rewards high per-send rate, penalizes
    small samples and high-volume-but-low-rate copies. Returns 0..1."""
    if not n:
        return None
    phat = k / n
    denom = 1 + z * z / n
    center = phat + z * z / (2 * n)
    margin = z * math.sqrt((phat * (1 - phat) + z * z / (4 * n)) / n)
    return max(0.0, (center - margin) / denom)


def weight_copies(rows):
    """Composite copy weight = relevance × performance(per-send, sample-adjusted) ×
    recency(time decay). Ranks by rate-over-volume, discounts old copies."""
    now = datetime.now(timezone.utc)
    for r in rows:
        sent = r.get("sent") or 0
        booked = r.get("booked") or 0
        # positives may not be selected; fall back to positive_rate*sent if present
        pos = r.get("positives")
        if pos is None and r.get("positive_rate") is not None and sent:
            pos = round(r["positive_rate"] * sent)
        # performance per send, Wilson-bounded: bookings > POWER requests (reply quality,
        # Khizar's metric) > raw positives
        power = r.get("power_requests")
        if sent:
            wb = _wilson(booked, sent) or 0.0
            wq = _wilson(power or 0, sent) or 0.0
            wp = _wilson(pos or 0, sent) or 0.0
            perf = (0.5 * wb + 0.3 * wq + 0.2 * wp) if power is not None else (0.7 * wb + 0.3 * wp)
        else:
            # no metrics yet: fall back to the human/label verdict so a known
            # loser never ties a known winner
            perf = {"winner": UNPROVEN_PRIOR, "loser": UNPROVEN_PRIOR * 0.4}.get(
                r.get("status"), UNPROVEN_PRIOR * 0.8)
        # recency decay from created_at
        created = r.get("created_at")
        recency = 1.0
        aged = False
        if created:
            if isinstance(created, str):
                try:
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except ValueError:
                    created = None
            if created:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                age_days = max(0.0, (now - created).total_seconds() / 86400)
                recency = 0.5 ** (age_days / RECENCY_HALF_LIFE_DAYS)
                aged = age_days > AGED_DAYS
        rel = r.get("score") or 0.0
        # past clients: older playbook era — their copies are reference, not gospel
        past = 0.6 if r.get("client_status") == "past" else 1.0
        r["performance"] = round(perf, 4)
        r["recency"] = round(recency, 4)
        r["aged"] = aged
        r["weight"] = round(rel * perf * recency * past, 5)
    rows.sort(key=lambda r: r.get("weight", 0), reverse=True)
    return rows

# type -> (table, vector_col, select_cols, optional niche filter col)
SPECS = {
    "pains": (
        "master_sheet_pains", "embedding",
        "id, client_slug, kind, persona, item_text, confidence, created_at", "niche",
    ),
    "calls": (
        "call_chunks", "embedding",
        "id, client_slug, chunk_text", "niche",
    ),
    "case_studies": (
        "case_studies", "result_embedding",
        "id, owner_client_slug as client_slug, subject_brand, tier, after_state, unique_mechanism, created_at", "niche",
    ),
    "copies": (
        "copies", "full_copy_embedding",
        "id, client_slug, status, variant, lever, pattern, sophistication, t1, t2, "
        "unique_mechanism, pattern_interrupt, cta, why_it_worked, why_it_failed, created_at", "niche",
    ),
    "components": (
        "copy_components", "embedding",
        "id, component_type, item_text, verdict, persona, lever", "niche",
    ),
    "offers": (
        "offers", "embedding",
        "id, client_slug, offer_text, service, pattern, mechanism, proof_hint", None,
    ),
    "deals": (
        "deals", "conversation_embedding",
        "id, client_slug, company, contact, job_title, job_function, seniority, stage, "
        "positive_reply_category, lost_reason, variant, channel, campaign_name, "
        "left(conversation, 2000) as conversation", None,
    ),
    "slack": (
        "slack_messages", "embedding",
        "id, client_slug, user_name, text, posted_at as created_at", None,
    ),
    "guidelines": (
        "guidelines", "embedding",
        "id, client_slug, kind, guideline_text, context, source, created_at", None,
    ),
    "drafts": (
        "client_drafts", "embedding",
        "id, client_slug, kind, title, content, source, created_at", None,
    ),
    "materials": (
        "material_chunks", "embedding",
        "id, material_id, client_slug, title, material_type, context, chunk_text", None,
    ),
    "contacts": (
        "contacts", "conversation_embedding",
        "id, client_slug, name, title, job_function, company, lead_category, channel, "
        "campaign_name, copy_variant, left(conversation, 2000) as conversation, created_at", None,
    ),
}


def route_niches(cur, qvec, top=2, min_score=0.55):
    """Stage 1: route the query to the most relevant niche(s) by comparing it to
    each niche_knowledge.summary_embedding. Returns [(niche, score), ...]."""
    cur.execute(
        """select niche, 1 - (summary_embedding <=> %s::vector) as score
           from niche_knowledge
           where summary_embedding is not null
           order by summary_embedding <=> %s::vector
           limit %s""",
        (qvec, qvec, top),
    )
    rows = [(n, round(float(s), 4)) for n, s in cur.fetchall()]
    return [r for r in rows if r[1] >= min_score] or rows  # keep best even if below cutoff


def run(stype, query, niche, status, limit, route=False, niche_id=None, sub_niche_id=None):
    if stype not in SPECS:
        raise SystemExit(f"unknown type '{stype}'. one of {sorted(SPECS)}")
    table, vec, cols, niche_col = SPECS[stype]
    qvec = embed_query(query)

    routed = []
    conn0 = None
    where = [f"{vec} is not null"]
    params = []
    if stype == "guidelines":
        where.append("active = true")

    # exact canonical filters (id-based, no fuzziness) — tables that carry the columns
    HAS_NICHE_ID = {"master_sheet_pains", "case_studies"}
    if niche_id and table in HAS_NICHE_ID:
        where.append("niche_id = %s")
        params.append(niche_id)
    if sub_niche_id and table in HAS_NICHE_ID:
        where.append("sub_niche_id = %s")
        params.append(sub_niche_id)

    # Stage 1: niche routing (only when no explicit niche was given)
    if route and not niche and niche_col:
        conn0 = get_conn()
        with conn0.cursor() as rc:
            routed = route_niches(rc, qvec)
        niches = [n for n, _ in routed]
        if niches:
            where.append(f"{niche_col} = ANY(%s)")
            params.append(niches)
    elif niche and niche_col:
        where.append(f"{niche_col} = %s")
        params.append(niche)

    if status and stype == "copies":
        where.append("status = %s")
        params.append(status)
    where_sql = " and ".join(where)

    sql = (
        f"select {cols}, 1 - ({vec} <=> %s::vector) as score "
        f"from {table} where {where_sql} "
        f"order by {vec} <=> %s::vector limit %s"
    )
    args = [qvec] + params + [qvec, limit]

    conn = conn0 or get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            colnames = [d[0] for d in cur.description]
            rows = [dict(zip(colnames, r)) for r in cur.fetchall()]

        for r in rows:
            if "score" in r and r["score"] is not None:
                r["score"] = round(float(r["score"]), 4)

        # for copies: attach real per-send stats, then rank by the composite weight
        # (relevance × per-send performance × recency) instead of raw similarity.
        if stype == "copies" and rows:
            ids = [r["id"] for r in rows]
            with conn.cursor() as cur:
                cur.execute(
                    "select copy_id, positive_rate, positives, sent, booked, power_requests, power_rate "
                    "from copy_performance where copy_id = any(%s)",
                    (ids,),
                )
                perf = {row[0]: {"positive_rate": float(row[1]) if row[1] is not None else None,
                                 "positives": row[2], "sent": row[3], "booked": row[4],
                                 "power_requests": row[5],
                                 "power_rate": float(row[6]) if row[6] is not None else None}
                        for row in cur.fetchall()}
            for r in rows:
                r.update(perf.get(r["id"], {}))
            # attach client status so past clients' copies rank as reference, not gospel
            slugs = list({r["client_slug"] for r in rows if r.get("client_slug")})
            if slugs:
                with conn.cursor() as cur:
                    cur.execute("select slug, status from client_roster where slug = any(%s)", (slugs,))
                    st = dict(cur.fetchall())
                for r in rows:
                    r["client_status"] = st.get(r.get("client_slug"))
            rows = weight_copies(rows)
        elif stype == "pains" and rows:
            rows = weight_pains(rows)
        elif stype == "case_studies" and rows:
            rows = weight_cases(rows)
        print(json.dumps(
            {"type": stype, "query": query, "routed": [{"niche": n, "score": s} for n, s in routed],
             "results": rows},
            default=str,
        ))
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", required=True)
    ap.add_argument("--query", required=True)
    ap.add_argument("--niche", default=None)
    ap.add_argument("--status", default=None, help="copies only: winner/loser/...")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--route", action="store_true", help="route to the best niche(s) first, then search within")
    ap.add_argument("--niche-id", type=int, default=None, help="exact canonical niche filter")
    ap.add_argument("--sub-niche-id", type=int, default=None, help="exact canonical sub-niche filter")
    args = ap.parse_args()
    run(args.type, args.query, args.niche, args.status, args.limit, args.route,
        args.niche_id, args.sub_niche_id)
