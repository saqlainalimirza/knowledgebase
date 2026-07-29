"""copy_mine_agent.py - reconstruct copies from the deal conversations.

The insight (Hilal): the copy is already in the data. Every deal conversation
starts with the outbound messages we actually sent (T1, then T2), and the deal
already carries its campaign and variant. So instead of anyone typing campaign
names to link copies, we mine the copy back OUT of the conversations:

  1. group usable deals by (campaign_id, variant),
  2. parse the first two OUTBOUND messages from each conversation (= T1, T2),
  3. Gemini extracts the canonical template across examples (keeps the wording
     verbatim, replaces per-lead bits like the first name with placeholders),
  4. save it as a copy LINKED to that campaign + variant, so it inherits the real
     performance (sends, positives, power, booked) automatically.

Idempotent: origin='mined_from_deal' + (campaign_id, variant) is the dedup key;
re-running replaces the mined copy for a group.

Usage:
  python copy_mine_agent.py --client kynship [--dry-run] [--max-groups N]
  python copy_mine_agent.py --all
"""
import os
import re
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import extract_json
from shared.embed import embed_all

MIN_BODY = 15          # ignore trivial outbound blocks
MAX_EXAMPLES = 6       # examples per group fed to Gemini
_MARKER = re.compile(r"(Outbound|Inbound)\s*-\s*[^\n]*?(?:said|wrote)\s*:", re.I)

SYSTEM = "You extract the reusable outreach copy template from real sent messages. Output only JSON."
PROMPT = """These are the opening cold-outreach messages sent in ONE campaign to different
leads. They are the SAME template with each lead's personal details swapped in.

--- FIRST MESSAGE (T1) examples ---
{t1}

--- SECOND MESSAGE (T2) examples ---
{t2}

Extract the single canonical template. Keep the persuasive wording VERBATIM (do not
rewrite or improve it). Replace ONLY the per-lead personalization with placeholders:
{{first_name}}, {{company}}, {{brand}}, {{product}}. If there is no real second message,
set t2 to null. Output JSON only: {{"t1":"...","t2":"..." or null}}"""


def outbound_messages(conv):
    """Return the outbound message bodies (the copy we sent), in order."""
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


def _deal_groups(cur, slug):
    """Deals carry a variant, so mine variant-accurate (campaign_id, variant) groups."""
    cur.execute(
        """select campaign_id, variant, conversation
           from deals
           where client_slug=%s and campaign_id is not null and variant is not null
             and conversation is not null and length(conversation) > 150
           order by campaign_id, variant""",
        (slug,),
    )
    groups = {}
    for cid, variant, conv in cur.fetchall():
        groups.setdefault((cid, variant), []).append(conv)
    return groups


def _contact_groups(cur, slug, covered):
    """Campaign-level copy from the contact reply threads — for campaigns that got NO
    deal-mined copy (e.g. campaigns whose only replies were negative/neutral, which live
    in contacts, not deals). Variant is ignored: one representative template per campaign
    is enough for reporting 'what copy is live'. Skips campaigns already covered by deals."""
    cur.execute(
        """select db_campaign_id, conversation
           from contacts
           where client_slug=%s and db_campaign_id is not null
             and conversation is not null and length(conversation) > 150
           order by db_campaign_id""",
        (slug,),
    )
    groups = {}
    for cid, conv in cur.fetchall():
        if cid in covered:
            continue
        groups.setdefault(cid, []).append(conv)
    return groups


def _mine_group(conn, slug, cid, variant, convs, origin, niche, sub_niche, dry_run):
    """Extract one canonical copy from a group of conversations, save it linked to the
    campaign (so it inherits real stats). Returns True if a copy was saved."""
    t1s, t2s = [], []
    for conv in convs:
        msgs = outbound_messages(conv)
        if msgs:
            t1s.append(msgs[0])
        if len(msgs) > 1:
            t2s.append(msgs[1])
    if not t1s:
        return False
    t1_ex = "\n---\n".join(t1s[:MAX_EXAMPLES])
    t2_ex = "\n---\n".join(t2s[:MAX_EXAMPLES]) or "(none)"
    try:
        data = extract_json(PROMPT.format(t1=t1_ex, t2=t2_ex), system=SYSTEM)
    except Exception as e:
        print(f"  campaign {cid} var {variant}: extract failed {e}")
        return False
    t1 = (data.get("t1") or "").strip()
    t2 = (data.get("t2") or "").strip() or None
    if not t1:
        return False
    with conn.cursor() as cur:
        cur.execute("select channel, niche, persona from campaigns where id=%s", (cid,))
        crow = cur.fetchone()
        channel, c_niche, c_persona = (crow or (None, None, None))
    print(f"  [{origin}] campaign {cid} var {variant} ({len(convs)} threads): {t1[:66]}...")
    if dry_run:
        return False
    with conn.cursor() as cur:
        # replace any prior mined copy for this (origin, campaign, variant)
        cur.execute(
            "delete from copies where origin=%s and campaign_id=%s and coalesce(variant,'')=coalesce(%s,'')",
            (origin, cid, variant),
        )
        from shared.writers import save_copy
        save_copy(cur, {
            "origin": origin, "client_slug": slug, "campaign_id": cid,
            "variant": variant, "channel": channel or "sms",
            "niche": c_niche or niche, "sub_niche": sub_niche, "persona": c_persona,
            "t1": t1, "t2": t2, "status": "neutral",
        })
    conn.commit()
    return True


def mine_client(slug, dry_run=False, max_groups=None, fill_only=False):
    """Reconstruct the live copy per campaign from its reply threads.
    fill_only=True (daily sync): skip campaigns that already have a mined copy — cheap,
    only reconstructs copy for NEW campaigns. Full run (default) re-mines everything."""
    conn = get_conn()
    made = 0
    try:
        with conn.cursor() as cur:
            cur.execute("select niche, sub_niche from client_roster where slug=%s", (slug,))
            row = cur.fetchone()
            niche, sub_niche = (row or (None, None))
            existing = set()
            if fill_only:
                cur.execute(
                    """select distinct campaign_id from copies
                       where campaign_id is not null and client_slug=%s
                         and origin in ('mined_from_deal','mined_from_contact')""",
                    (slug,),
                )
                existing = {r[0] for r in cur.fetchall()}
            deal_groups = _deal_groups(cur, slug)

        # 1) variant-accurate copy from deal (positive/opportunity) threads
        items = list(deal_groups.items())
        if max_groups:
            items = items[:max_groups]
        print(f"{slug}: {len(items)} deal campaign+variant groups"
              + (f" ({len(existing)} campaigns already have copy, skipping)" if fill_only else ""))
        covered = set(existing)  # campaigns that already have (or now get) a mined copy
        for (cid, variant), convs in items:
            if fill_only and cid in existing:
                continue
            if _mine_group(conn, slug, cid, variant, convs, "mined_from_deal", niche, sub_niche, dry_run):
                made += 1
                covered.add(cid)

        # 2) fill campaigns with no deal-mined copy using their contact threads (negatives etc.)
        with conn.cursor() as cur:
            contact_groups = _contact_groups(cur, slug, covered)
        c_items = list(contact_groups.items())
        if max_groups:
            c_items = c_items[:max_groups]
        print(f"{slug}: {len(c_items)} contacts-only campaign groups")
        for cid, convs in c_items:
            if _mine_group(conn, slug, cid, "A", convs, "mined_from_contact", niche, sub_niche, dry_run):
                made += 1

        if not dry_run:
            n = embed_all(conn, only_tables={"copies"})
            print(f"{slug}: mined {made} copies, embedded {n} vectors")
        else:
            print(f"{slug}: dry run, {made} would be saved")
    finally:
        conn.close()
    return made


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-groups", type=int, default=None)
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select slug from client_roster where status='active' order by slug")
        slugs = [r[0] for r in cur.fetchall()]; conn.close()
        for s in slugs:
            try:
                mine_client(s)
            except Exception as e:
                print(f"{s}: ERR {e}")
    elif args.client:
        mine_client(args.client, dry_run=args.dry_run, max_groups=args.max_groups)
    else:
        raise SystemExit("pass --client or --all")
