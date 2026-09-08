"""churn_sync_agent.py - mirror each client's churn state from the Airtable CRM.

Evergreen only ever stored the client row; when a client left, nothing recorded WHEN
or that their history should be kept. This agent reads the CRM's client record and
writes the churn facts we cannot derive from outbound data:

  - airtable_client_id   (so campaign/deal backfill can find their records)
  - churn_status         (the CRM 'Client Status': Active / Paused / Churned)
  - churned_at           (the CRM 'Client Status Update Date', only for past clients)
  - onboarded_at         (the CRM 'Client Onboarding Date' -> tenure start)
  - churn_reason         (seeded from the status label; a real free-text reason, if
                          you add one to the roster later, is PRESERVED on re-sync)
  - status               ('past' if Churned/Paused, else 'active')

Airtable has no free-text churn-reason field: 'Client Status' is only an enum
(Active/Paused/Churned). We store that as the reason and leave churn_reason editable.

Usage:
  python churn_sync_agent.py --all
  python churn_sync_agent.py --client pirawna
"""
import os
import re
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from connections.supabase import get_conn
from connections.airtable import list_records

CLIENTS_TABLE = "📂 Clients"
PAST_STATUSES = {"churned", "paused"}


def _norm(s):
    if isinstance(s, list):
        s = s[0] if s else ""
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def _match(name, by_norm):
    """Match a roster client name to an Airtable client record. Exact-normalized
    first, then a contains fallback (handles 'DMA' vs 'DMA Marketing' drift)."""
    n = _norm(name)
    if n in by_norm:
        return by_norm[n]
    cand = [rec for k, rec in by_norm.items() if k and (n in k or k in n)]
    return cand[0] if len(cand) == 1 else None


def sync(only_slug=None):
    recs = list_records(CLIENTS_TABLE)
    by_norm = {_norm(r["fields"].get("Client Name")): r for r in recs}

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if only_slug:
                cur.execute("select slug, client from client_roster where slug=%s", (only_slug,))
            else:
                cur.execute("select slug, client from client_roster")
            roster = cur.fetchall()

            matched = unmatched = flipped = 0
            for slug, name in roster:
                rec = _match(name, by_norm)
                if not rec:
                    unmatched += 1
                    print(f"  {slug}: NO Airtable match (name={name!r})")
                    continue
                f = rec["fields"]
                status_label = (f.get("Client Status") or "").strip()  # Active/Paused/Churned
                is_past = status_label.lower() in PAST_STATUSES
                new_status = "past" if is_past else "active"
                churned_at = f.get("Client Status Update Date") if is_past else None

                cur.execute(
                    """update client_roster set
                         airtable_client_id = coalesce(airtable_client_id, %s),
                         churn_status       = %s,
                         onboarded_at       = coalesce(%s, onboarded_at),
                         churned_at         = %s,
                         churn_reason       = coalesce(churn_reason, nullif(%s,'')),
                         status             = %s,
                         updated_at         = now()
                       where slug = %s
                       returning (status='past')""",
                    (rec["id"], status_label or None, f.get("Client Onboarding Date"),
                     churned_at, status_label if is_past else None, new_status, slug),
                )
                matched += 1
                if cur.fetchone()[0]:
                    flipped += 1
            conn.commit()

            # Catch NEW clients that exist in the CRM but were never onboarded into Evergreen
            # (this is how Taktical Digital / DTCo / Score More Clients stayed invisible and
            # dragged every agency-wide total down). Add a minimal roster row so their stats
            # flow immediately; a proper niche/knowledge onboarding can follow.
            added = 0
            if not only_slug:
                cur.execute("select airtable_client_id from client_roster where airtable_client_id is not null")
                have = {r[0] for r in cur.fetchall()}
                for rec in recs:
                    f = rec["fields"]
                    status_label = (f.get("Client Status") or "").strip()
                    # ONLY auto-add ACTIVE clients (missing active clients silently break every
                    # agency total). Never auto-add churned/paused ones — pulling historical
                    # churned clients into Evergreen is a deliberate call, not an automatic one.
                    if rec["id"] in have or status_label.lower() != "active":
                        continue
                    name = f.get("Client Name")
                    name = name[0] if isinstance(name, list) else name
                    if not name:
                        continue
                    slug = re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")
                    cur.execute(
                        """insert into client_roster(slug, client, airtable_client_id, status,
                             churn_status, onboarded_at)
                           values (%s,%s,%s,'active',%s,%s)
                           on conflict (slug) do update set
                             airtable_client_id = excluded.airtable_client_id""",
                        (slug, name, rec["id"], status_label or None, f.get("Client Onboarding Date")),
                    )
                    added += 1
                    print(f"  + added new ACTIVE client from CRM: {name} ({slug})")
                conn.commit()
        print(f"churn-sync: matched={matched} unmatched={unmatched} now-past={flipped} new-added={added}")
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--client")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        sync()
    elif args.client:
        sync(args.client)
    else:
        raise SystemExit("pass --client or --all")
