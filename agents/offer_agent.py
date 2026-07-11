"""offer_agent.py - extract each client's OFFERS and their patterns.

An offer is what we actually pitch: the service + the angle + the hook that makes it
land (e.g. "free ad-account audit", "performance guarantee: 10 qualified leads or you
don't pay", "done-for-you creative with 15-month lifespan"). Offers live scattered in
the client's offer text, copies (CTAs/mechanisms), and case studies. This agent gathers
that raw material per client, asks Gemini to identify the distinct offers + classify
each with a PATTERN, and upserts into the offers table. Embeddings make offers
cross-referenceable with case studies and pains.

Usage:
  python offer_agent.py --client kynship
  python offer_agent.py --all
"""
import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.gemini import extract_json
from shared.embed import embed_all

SYSTEM = (
    "You analyze a marketing agency's client and identify the distinct OFFERS they run "
    "in cold outreach. Return STRICT JSON only. Never invent offers that have no basis "
    "in the material."
)

PROMPT = """From the material below, identify the distinct OFFERS this client uses (or
could credibly use) in cold outreach. An offer = SERVICE + angle + the hook that makes
it land. The service category is the most important field: it is how clients get
cross-connected (a local-SEO offer for one client links to every other client selling
local SEO).

Return STRICT JSON: {{ "offers": [ ... ] }} where each item is:
{{
  "offer_text": "one clear sentence stating the offer as pitched to a prospect",
  "service": "one of: seo | local_seo | paid_ads | creative | tiktok_shop | amazon |
              pr | email_sms_marketing | web_design | cro | returns_software | other",
  "pattern": "one of: free_audit | performance_guarantee | done_for_you | free_pilot |
              case_study_teardown | unique_mechanism_pitch | partnership | risk_reversal | other",
  "mechanism": "the unique mechanism behind it, <15 words, or null",
  "proof_hint": "which case study / result would back this offer, or null"
}}

Rules:
- 2 to 6 offers max. Merge near-duplicates.
- Judge `service` mainly from the CASE STUDIES (what they actually did for clients) and
  past copies; the stated offer text can be aspirational.
- service and pattern must be from their lists; pick the closest.
- Ground every offer in the material (their services, guarantees, audits, mechanisms).

CLIENT: {client}
MATERIAL:
---
{material}
---"""

# CSV client-name -> slug (winners/losers sheets use display names)
CSV_CLIENTS = {"chamber":"chamber_media","chamber media":"chamber_media","go fish digital":"go_fish",
               "kynship":"kynship","wise digital partners":"wise_digital","digital resource":"digital_resource",
               "growth lab":"growth_lab","leadgenix":"leadgenix","scaletopia":"scaletopia","seedx":"seedx"}


def csv_offers_for(slug):
    """Offers column from the winners/losers CSVs (per-copy 'offer' field)."""
    import csv, os
    out = []
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")
    for fname in ("winners.csv", "losers.csv"):
        path = os.path.join(base, fname)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if CSV_CLIENTS.get((r.get("client") or "").strip().lower()) == slug and r.get("offer"):
                    out.append(r["offer"].strip())
    return sorted(set(out))


def gather_material(cur, slug):
    parts = []
    cur.execute("select client, offer, niche from client_roster where slug=%s", (slug,))
    row = cur.fetchone()
    if not row:
        return None, None
    name, offer, niche = row
    if offer:
        parts.append(f"## Stated offer\n{offer}")
    cur.execute("""select tier, subject_brand, after_state, unique_mechanism, service
                   from case_studies where owner_client_slug=%s
                   order by tier limit 8""", (slug,))
    cs = cur.fetchall()
    if cs:
        parts.append("## Case studies\n" + "\n".join(
            f"- [{t}] {b}: {a} (mechanism: {m}; service: {s})" for t, b, a, m, s in cs))
    cur.execute("""select t1, t2, unique_mechanism, cta, status from copies
                   where client_slug=%s limit 10""", (slug,))
    cp = cur.fetchall()
    if cp:
        parts.append("## Copies (what we actually pitched)\n" + "\n".join(
            f"- [{st}] {t1} / {t2} (mechanism: {m}; cta: {c})" for t1, t2, m, c, st in cp))
    cur.execute("""select item_text from master_sheet_pains
                   where client_slug=%s and kind='dream' limit 6""", (slug,))
    dr = [r[0] for r in cur.fetchall()]
    if dr:
        parts.append("## Buyer dreams (what prospects want)\n" + "\n".join(f"- {d}" for d in dr))
    csvo = csv_offers_for(slug)
    if csvo:
        parts.append("## Offers used in past winning/losing copies (strong signal)\n" +
                     "\n".join(f"- {o}" for o in csvo))
    return name, "\n\n".join(parts)


def run(slug):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            name, material = gather_material(cur, slug)
            if not material:
                print(f"{slug}: no material, skipped")
                return
            data = extract_json(PROMPT.format(client=name, material=material), system=SYSTEM)
            cur.execute("select niche_id from client_roster where slug=%s", (slug,))
            niche_id = (cur.fetchone() or [None])[0]
            ins = skip = 0
            for o in data.get("offers", []):
                text = (o.get("offer_text") or "").strip()
                if not text:
                    continue
                cur.execute("""insert into offers(client_slug, offer_text, service, pattern,
                               mechanism, proof_hint, source, niche_id)
                               values(%s,%s,%s,%s,%s,%s,'offer_agent',%s)
                               on conflict (client_slug, offer_text) do nothing
                               returning id""",
                            (slug, text, o.get("service"), o.get("pattern"),
                             o.get("mechanism"), o.get("proof_hint"), niche_id))
                if cur.fetchone():
                    ins += 1
                else:
                    skip += 1
        conn.commit()
        n = embed_all(conn, only_tables={"offers"})
        print(f"{slug}: offers inserted={ins} skipped={skip}, embedded {n}")
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select slug from client_roster where status='active' order by slug")
        slugs = [r[0] for r in cur.fetchall()]
        conn.close()
        for s in slugs:
            run(s)
    elif args.client:
        run(args.client)
    else:
        raise SystemExit("pass --client or --all")
