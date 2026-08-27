"""variant_detect_agent.py - recover which copy VARIANT each lead got, from the message
we actually sent (the sending tool never tags it).

Per campaign (grouped by name, since one campaign spans many Airtable records):
  1. take each contact's first OUTBOUND message,
  2. strip the lead's name/company -> a template "signature",
  3. dedupe signatures, embed the distinct ones, cluster by meaning -> the variants,
  4. tag every contact with its variant (contacts.derived_variant = 'V1'/'V2'/...),
  5. store a representative copy per variant.

This makes "which variant/CTA won inside a campaign" a query instead of a manual pull.
Deterministic + one embed per distinct signature (cheap). Idempotent.

Usage:
  python variant_detect_agent.py --client scaletopia
  python variant_detect_agent.py --all
"""
import os
import re
import sys
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import embed_documents
from copy_mine_agent import _candidates, _is_opener, _placeholderize
from shared.taxonomy import _to_vec

CLUSTER_SIM = 0.90        # signatures this similar are the same variant
MIN_GROUP = 8             # need enough leads on a campaign to bother splitting


def _opener_signature(conv, name, company):
    """The first genuine outbound opener, name/company stripped -> a comparable signature."""
    for body, _kind in _candidates(conv):
        if _is_opener(body):
            sig = _placeholderize(body, name, company)
            sig = re.sub(r"\s+", " ", sig).strip().lower()
            return sig[:400] or None
    return None


def _embed(strings):
    """Embed in batches of 100 (Gemini's per-request cap)."""
    out = []
    for i in range(0, len(strings), 100):
        out.extend(embed_documents(strings[i:i + 100]))
    return out


def _cluster(signatures):
    """signatures: list of distinct strings. Return {sig: variant_label}."""
    if not signatures:
        return {}
    vecs = [_to_vec(v) for v in _embed(signatures)]
    reps = []                      # (seed_vec, label, seed_sig)
    label_of = {}
    for sig, v in sorted(zip(signatures, vecs), key=lambda x: -len(x[0])):  # longest first = fullest
        placed = False
        for seed, label, _ in reps:
            if float(np.dot(v, seed)) >= CLUSTER_SIM:
                label_of[sig] = label; placed = True; break
        if not placed:
            label = f"V{len(reps) + 1}"
            reps.append((v, label, sig)); label_of[sig] = label
    return label_of


def detect_client(slug, incremental=False):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            needing = None
            if incremental:
                # only campaigns with a real batch of NEW untagged contacts (>= MIN_GROUP), so
                # permanently-unassignable rare tails don't trigger a re-embed every run.
                cur.execute(
                    """select ca.name from contacts ct join campaigns ca on ca.id=ct.db_campaign_id
                       where ct.client_slug=%s and ct.variant_checked_at is null
                         and ct.conversation is not null and length(ct.conversation) > 60
                       group by ca.name having count(*) >= %s""",
                    (slug, MIN_GROUP),
                )
                needing = {r[0] for r in cur.fetchall()}
                if not needing:
                    print(f"{slug}: no new contacts to detect"); return
            cur.execute(
                """select ct.id, ct.name, ct.company, ct.conversation, ca.name as campaign
                   from contacts ct join campaigns ca on ca.id = ct.db_campaign_id
                   where ct.client_slug=%s and ct.conversation is not null
                     and length(ct.conversation) > 60""",
                (slug,),
            )
            rows = cur.fetchall()
        # group contacts by campaign NAME (one logical campaign spans many records)
        by_campaign = {}
        for cid, name, company, conv, campaign in rows:
            sig = _opener_signature(conv, name, company)
            if sig:
                by_campaign.setdefault(campaign, []).append((cid, sig))

        total_tagged = 0
        for campaign, items in by_campaign.items():
            if needing is not None and campaign not in needing:
                continue                      # incremental: skip campaigns with nothing new
            if len(items) < MIN_GROUP:
                continue
            # cluster the most common distinct signatures (cap 100 = Gemini batch + noise guard);
            # rare one-off signatures (heavy personalization leftovers) stay unattributed.
            from collections import Counter
            freq = Counter(sig for _cid, sig in items)
            top = [s for s, _ in freq.most_common(100)]
            labels = _cluster(top)
            n_variants = len(set(labels.values()))
            with conn.cursor() as cur:
                for cid, sig in items:
                    lab = labels.get(sig)   # None for rare tails -> stays null but IS marked checked
                    cur.execute(
                        "update contacts set derived_variant=%s, variant_checked_at=now() where id=%s",
                        (lab, cid))
                    if lab:
                        total_tagged += 1
            conn.commit()
            if n_variants > 1:
                print(f"  {campaign[:50]}: {len(items)} leads -> {n_variants} variants")
        print(f"{slug}: tagged {total_tagged} contacts with a derived variant")
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--incremental", action="store_true", help="only campaigns with new untagged contacts")
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select slug from client_roster where status='active' order by slug")
        slugs = [r[0] for r in cur.fetchall()]; conn.close()
        for s in slugs:
            try: detect_client(s, incremental=args.incremental)
            except Exception as e: print(f"{s}: ERR {e}")
    elif args.client:
        detect_client(args.client, incremental=args.incremental)
    else:
        raise SystemExit("pass --client or --all")
