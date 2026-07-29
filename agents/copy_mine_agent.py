"""copy_mine_agent.py - reconstruct the live copy per campaign from its reply threads.

The live copy is never stored in the CRM (it lives in the sending tools). But every reply
thread opens with the outbound messages we actually sent. So for any campaign that has no
copy yet (an "orphan"), we:
  1. pull its reply threads from deals (preferred) or contacts,
  2. pick ONE representative thread — the one with the fullest opening message,
  3. take the first two OUTBOUND messages -> T1 and T2,
  4. swap that one lead's own name/company back to {first_name}/{company} placeholders,
  5. save it linked to the campaign, so it inherits the campaign's real stats.

Deterministic and free: no LLM, no cross-example averaging. Idempotent by design — only
orphan campaigns are touched, so a nightly run never re-does a campaign that already has a
copy and never creates duplicates. Pass --rebuild to force a fresh reconstruction for all.

Usage:
  python copy_mine_agent.py --client kynship
  python copy_mine_agent.py --all
  python copy_mine_agent.py --client kynship --rebuild   # re-mine every campaign
"""
import os
import re
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from shared.embed import embed_all
from shared.writers import save_copy

MIN_BODY = 15   # ignore trivial outbound blocks (delivery receipts, "ok", etc.)
MINED_ORIGINS = ("mined_from_deal", "mined_from_contact")
_MARKER = re.compile(r"(Outbound|Inbound)\s*-\s*[^\n]*?(?:said|wrote)\s*:", re.I)


def outbound_messages(conv):
    """The outbound message bodies (the copy we sent), in order."""
    if not conv:
        return []
    marks = list(_MARKER.finditer(conv))
    out = []
    for i, m in enumerate(marks):
        start = m.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(conv)
        body = conv[start:end].strip()
        if m.group(1).lower() == "outbound" and len(body) >= MIN_BODY:
            out.append(body)
    return out


def _placeholderize(text, name, company):
    """Swap this one lead's personal details back to placeholders, deterministically."""
    if not text:
        return text
    out = text
    if company and len(company.strip()) >= 2:
        out = re.sub(re.escape(company.strip()), "{company}", out, flags=re.I)
    if name and name.strip():
        first = name.strip().split()[0]
        if len(first) >= 2:
            out = re.sub(r"\b" + re.escape(first) + r"\b", "{first_name}", out, flags=re.I)
    return out


def _clean(text):
    """Tidy raw email/SMS whitespace so the reconstructed copy reads clean in the report."""
    if not text:
        return text
    text = "\n".join(ln.rstrip() for ln in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _orphan_threads(cur, slug, rebuild=False):
    """Candidate reply threads for each campaign that has no reconstructed copy yet.
    Returns {campaign_id: [(conversation, name, company, variant, origin), ...]}."""
    covered = set()
    if not rebuild:
        cur.execute(
            """select distinct campaign_id from copies
               where campaign_id is not null and client_slug=%s
                 and origin in %s""",
            (slug, MINED_ORIGINS),
        )
        covered = {r[0] for r in cur.fetchall()}

    cand = {}
    # deals first (positive/opportunity threads = cleaner openers)
    cur.execute(
        """select campaign_id, conversation, contact, company, variant from deals
           where client_slug=%s and campaign_id is not null
             and conversation is not null and length(conversation) > 120""",
        (slug,),
    )
    for cid, conv, name, company, variant in cur.fetchall():
        if cid in covered:
            continue
        cand.setdefault(cid, []).append((conv, name, company, variant, "mined_from_deal"))
    # contacts add the campaigns deals never reach (negative/neutral-only campaigns)
    cur.execute(
        """select db_campaign_id, conversation, name, company, copy_variant from contacts
           where client_slug=%s and db_campaign_id is not null
             and conversation is not null and length(conversation) > 120""",
        (slug,),
    )
    for cid, conv, name, company, variant in cur.fetchall():
        if cid in covered:
            continue
        cand.setdefault(cid, []).append((conv, name, company, variant, "mined_from_contact"))
    return cand


def _best_thread(threads):
    """Pick the thread whose first outbound message is the fullest (most complete opener)."""
    best, best_len = None, -1
    for conv, name, company, variant, origin in threads:
        msgs = outbound_messages(conv)
        if not msgs:
            continue
        if len(msgs[0]) > best_len:
            best, best_len = (msgs, name, company, variant, origin), len(msgs[0])
    return best


def mine_client(slug, rebuild=False):
    conn = get_conn()
    made = 0
    try:
        with conn.cursor() as cur:
            cur.execute("select niche, sub_niche from client_roster where slug=%s", (slug,))
            niche, sub_niche = (cur.fetchone() or (None, None))
            if rebuild:
                cur.execute(
                    "delete from copies where client_slug=%s and origin in %s",
                    (slug, MINED_ORIGINS),
                )
            cand = _orphan_threads(cur, slug, rebuild=rebuild)
        print(f"{slug}: {len(cand)} orphan campaigns with reply threads")

        for cid, threads in cand.items():
            picked = _best_thread(threads)
            if not picked:
                continue   # no parseable outbound in any thread (e.g. email-only format)
            msgs, name, company, variant, origin = picked
            t1 = _clean(_placeholderize(msgs[0], name, company))
            t2 = _clean(_placeholderize(msgs[1], name, company)) if len(msgs) > 1 else None
            with conn.cursor() as cur:
                cur.execute("select channel, niche, persona from campaigns where id=%s", (cid,))
                channel, c_niche, c_persona = (cur.fetchone() or (None, None, None))
                # idempotent: clear any prior reconstruction for this campaign, then write one
                cur.execute(
                    "delete from copies where campaign_id=%s and origin in %s",
                    (cid, MINED_ORIGINS),
                )
                save_copy(cur, {
                    "origin": origin, "client_slug": slug, "campaign_id": cid,
                    "variant": variant or "A", "channel": channel or "sms",
                    "niche": c_niche or niche, "sub_niche": sub_niche, "persona": c_persona,
                    "t1": t1, "t2": t2, "status": "neutral",
                })
            conn.commit()
            made += 1

        n = embed_all(conn, only_tables={"copies"})
        print(f"{slug}: reconstructed {made} campaign copies, embedded {n} vectors")
    finally:
        conn.close()
    return made


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--rebuild", action="store_true", help="re-mine every campaign, not just orphans")
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select slug from client_roster where status='active' order by slug")
        slugs = [r[0] for r in cur.fetchall()]; conn.close()
        for s in slugs:
            try:
                mine_client(s, rebuild=args.rebuild)
            except Exception as e:
                print(f"{s}: ERR {e}")
    elif args.client:
        mine_client(args.client, rebuild=args.rebuild)
    else:
        raise SystemExit("pass --client or --all")
