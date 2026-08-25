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
from shared.cta import extract_cta

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
    # greeting-name leak guard: catch the recipient's name even when the record's name field
    # didn't match what the message actually used (e.g. "Hi David," / "David,\n").
    out = re.sub(r"^(\s*(?:hi|hey|hello|dear|hiya)\s+)([A-Z][a-zA-Z'’\-]+)",
                 r"\1{first_name}", out, count=1, flags=re.I)
    out = re.sub(r"^(\s*)[A-Z][a-z]{1,}(,[ \t]*(?:\n|$))", r"\1{first_name}\2", out, count=1)
    return out


def _clean(text):
    """Tidy raw email/SMS whitespace so the reconstructed copy reads clean in the report."""
    if not text:
        return text
    text = "\n".join(ln.rstrip() for ln in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _vkey(variant):
    """Normalize a variant label; blank (untagged / old data) folds to 'A'."""
    return (variant or "").strip().upper()[:8] or "A"


def _orphan_threads(cur, slug, rebuild=False):
    """Candidate reply threads keyed by (campaign_id, variant) that has no copy yet — so a
    campaign running A/B gets one reconstructed copy PER variant, not one merged copy.
    Returns {(campaign_id, vkey): [(conversation, name, company, vkey, origin), ...]}."""
    covered = set()
    if not rebuild:
        cur.execute(
            """select distinct campaign_id, coalesce(nullif(upper(trim(variant)),''),'A')
               from copies where campaign_id is not null and client_slug=%s and origin in %s""",
            (slug, MINED_ORIGINS),
        )
        covered = {(cid, v) for cid, v in cur.fetchall()}

    cand = {}
    # deals first (positive/opportunity threads = cleaner openers)
    cur.execute(
        """select campaign_id, conversation, contact, company, variant from deals
           where client_slug=%s and campaign_id is not null
             and conversation is not null and length(conversation) > 120""",
        (slug,),
    )
    for cid, conv, name, company, variant in cur.fetchall():
        vk = _vkey(variant)
        if (cid, vk) in covered:
            continue
        cand.setdefault((cid, vk), []).append((conv, name, company, vk, "mined_from_deal"))
    # contacts add the campaigns/variants deals never reach (negative/neutral-only)
    cur.execute(
        """select db_campaign_id, conversation, name, company, copy_variant from contacts
           where client_slug=%s and db_campaign_id is not null
             and conversation is not null and length(conversation) > 120""",
        (slug,),
    )
    for cid, conv, name, company, variant in cur.fetchall():
        vk = _vkey(variant)
        if (cid, vk) in covered:
            continue
        cand.setdefault((cid, vk), []).append((conv, name, company, vk, "mined_from_contact"))
    return cand


_GREETING = re.compile(r"^\s*(hi|hey|hello|dear|hiya)\b", re.I)
# a follow-up / bump / breakup, not the opener
_FOLLOWUP = re.compile(
    r"\b(no worries|just (following|checking)|follow(ing)? up|circl(e|ing) back|bump(ing)? this|"
    r"thought i'?d try|try my luck|did you get a chance|checking in|in case you missed|"
    r"gentle nudge|quick bump|any thoughts|haven'?t heard|wanted to bump|resurfac)", re.I)
# a reaction/reply from the rep mid-conversation, not a cold opener (allow an optional greeting+name)
_REACTION = re.compile(
    r"^\s*(?:(?:hi|hey|hello|dear|hiya)[,\s]+)?(?:[A-Z][a-z]+[,\s]+)?"
    r"(thanks|thank you|appreciate|no worries|sounds good|sure\b|great\b|awesome|will get back|"
    r"let me (take|check|look|get)|happy to|got it|understood|perfect|makes sense|will do|noted|"
    r"of course|no problem)", re.I)
# outbound pitch signals that mark a genuine cold opener
_PITCH = re.compile(
    r"(we (recently|just)?\s*(helped|took|scaled|grew|built|work(ed|ing) with)|figured i'?d|"
    r"i know (you|your)|reaching out|can i (share|walk|show)|not sure if (it'?s|this)|noticed|"
    r"came across|saw (that|your|you)|helped (grow|scale)|from (gbp|usd|\$|£))", re.I)
# email 'From: <us> ... Subject: ...\n\n<body>' quoted-original block — the real email opener
_EMAIL_FROM = re.compile(
    r"^From:[^\n]*\n(?:[A-Za-z-]+:[^\n]*\n)*\n?(.*?)(?=^From:|^On .+wrote:|\Z)", re.S | re.M)


def _candidates(conv):
    """Plausible outbound bodies: SMS 'Outbound - said:' blocks + email From-block originals.
    Returns [(body, kind)] with kind in {'sms','email'}."""
    out = [(b, "sms") for b in outbound_messages(conv)]
    for m in _EMAIL_FROM.finditer(conv or ""):
        body = m.group(1).strip()
        if len(body) >= 40:
            out.append((body, "email"))
    return out


def _is_opener(text):
    """True only for a genuine cold opener — rejects follow-ups, bumps, and rep replies."""
    t = text.strip()
    if _FOLLOWUP.search(t[:120]) or _REACTION.match(t):
        return False
    return bool(_GREETING.match(t) or _PITCH.search(t[:400]))


def _rank(text):
    t = text.strip()
    s = min(len(t), 600) * 0.2
    if _GREETING.match(t):
        s += 100
    if _PITCH.search(t[:400]):
        s += 300
    return s


def _best_opener(threads):
    """Across all threads, pick the best genuine opener. Returns (t1, t2, name, company,
    variant, origin) or None if nothing qualifies (then we honestly show no copy). T2 is
    the paired second SMS message when the opener is an SMS first message."""
    best, best_score = None, -1
    for conv, name, company, variant, origin in threads:
        cands = _candidates(conv)
        sms = [b for b, k in cands if k == "sms"]
        for body, kind in cands:
            if not _is_opener(body):
                continue
            sc = _rank(body)
            if sc > best_score:
                t2 = sms[1] if (kind == "sms" and sms and body == sms[0] and len(sms) > 1) else None
                best, best_score = (body, t2, name, company, variant, origin), sc
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
        print(f"{slug}: {len(cand)} orphan (campaign, variant) groups with reply threads")

        for (cid, vk), threads in cand.items():
            picked = _best_opener(threads)
            if not picked:
                continue   # no genuine opener recoverable (auto-replies / rep replies only)
            t1_raw, t2_raw, name, company, variant, origin = picked
            t1 = _clean(_placeholderize(t1_raw, name, company))
            t2 = _clean(_placeholderize(t2_raw, name, company)) if t2_raw else None
            with conn.cursor() as cur:
                cur.execute("select channel, niche, persona from campaigns where id=%s", (cid,))
                channel, c_niche, c_persona = (cur.fetchone() or (None, None, None))
                # idempotent: clear any prior reconstruction for THIS (campaign, variant), then write one
                cur.execute(
                    "delete from copies where campaign_id=%s and coalesce(upper(variant),'A')=%s and origin in %s",
                    (cid, vk, MINED_ORIGINS),
                )
                save_copy(cur, {
                    "origin": origin, "client_slug": slug, "campaign_id": cid,
                    "variant": vk, "channel": channel or "sms",
                    "niche": c_niche or niche, "sub_niche": sub_niche, "persona": c_persona,
                    "t1": t1, "t2": t2, "cta": extract_cta(t1, t2), "status": "neutral",
                })
            conn.commit()
            made += 1

        n = embed_all(conn, only_tables={"copies"})
        print(f"{slug}: reconstructed {made} (campaign, variant) copies, embedded {n} vectors")
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
