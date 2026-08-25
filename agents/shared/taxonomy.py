"""Canonical niche tagging (the hybrid: AI infers -> embedding snaps to canonical
list -> human can override). Called by the ingest agents so every new client is
tagged on write, not by a later backfill.
"""
import re
import numpy as np

from connections.gemini import embed_documents

# persona -> (job_function, seniority) buckets — instant, rule-based
_RULES = [
    (r'\b(ceo|founder|owner|co-?founder|president|proprietor)\b', 'founder', 'founder'),
    (r'\b(cmo|cfo|coo|cto|cro|chief)\b', 'exec', 'c_level'),
    (r'\b(vp|vice president)\b', None, 'vp'),
    (r'\b(head of|director)\b', None, 'director'),
    (r'\b(manager|lead)\b', None, 'manager'),
    (r'\b(marketing|growth|brand|demand|acquisition|ecommerce|ecom)\b', 'marketing', None),
    (r'\b(sales|revenue)\b', 'sales', None),
]


def _buckets(persona):
    p = (persona or "").lower()
    func = sen = None
    for pat, f, s in _RULES:
        if re.search(pat, p):
            func = func or f
            sen = sen or s
    return func, sen


def _to_vec(v):
    """Coerce a pgvector column to a float ndarray regardless of how the driver
    returns it (ndarray when the numpy adapter is active, a pgvector Vector object,
    or a '[..]' string on version drift). Fixes the Railway 'not Vector' TypeError."""
    if v is None:
        return None
    if isinstance(v, np.ndarray):
        return v.astype(float)
    if isinstance(v, str):
        return np.asarray([float(x) for x in v.strip("[] ").split(",") if x.strip()], dtype=float)
    if hasattr(v, "to_numpy"):      # pgvector Vector
        return v.to_numpy().astype(float)
    if hasattr(v, "to_list"):
        return np.asarray(v.to_list(), dtype=float)
    return np.asarray(list(v), dtype=float)


def _load_niches(cur):
    cur.execute("select id, name, parent_id, embedding from niches where embedding is not null")
    return [(r[0], r[1], r[2], _to_vec(r[3])) for r in cur.fetchall()]


def _pack(nid, parent, score):
    """(niche_id, sub_niche_id, score): top-level -> (id, None); sub -> (parent, id)."""
    return (nid, None, score) if parent is None else (parent, nid, score)


def resolve_niche(cur, text, min_score=0.5, create=False):
    """Map an inferred niche to a canonical one, so cross-client pooling never splits on
    casing/spelling. Order:
      1. exact case-insensitive name match (kills 'DTC Ecom' vs 'DTC ecom' dupes instantly),
      2. embedding snap to the nearest canonical niche (>= min_score),
      3. if create=True and nothing matched, CREATE a new canonical niche and use it
         (so a genuinely new category becomes a home future clients can pool into);
         otherwise return (None, None, score) for human review.
    Returns (niche_id, sub_niche_id, score)."""
    if not text or not text.strip():
        return None, None, 0.0
    t = text.strip()

    # 1. exact, case-insensitive
    cur.execute("select id, parent_id from niches where lower(name)=lower(%s) limit 1", (t,))
    row = cur.fetchone()
    if row:
        return _pack(row[0], row[1], 1.0)

    # 2. embedding snap
    niches = _load_niches(cur)
    q = _to_vec(embed_documents([t])[0])
    if niches:
        best = max(niches, key=lambda n: float(np.dot(q, n[3])))
        score = float(np.dot(q, best[3]))
        if score >= min_score:
            return _pack(best[0], best[2], score)
    else:
        score = 0.0

    # 3. connect-or-create: no match -> mint a new canonical (top-level) niche
    if create:
        cur.execute("insert into niches(name) values (%s) returning id", (t,))
        nid = cur.fetchone()[0]
        cur.execute("update niches set embedding=%s where id=%s", (list(map(float, q)), nid))
        return nid, None, 1.0
    return None, None, score


def tag_client_and_inherit(cur, slug, niche_text=None):
    """On write: set the client's canonical niche (unless a human already set it),
    inherit it to that client's pains + case studies, and bucket personas."""
    cur.execute("select niche, niche_id, niche_source from client_roster where slug=%s", (slug,))
    row = cur.fetchone()
    if not row:
        return None
    niche, niche_id, source = row
    if source != 'human':
        # connect-or-create: onboarding always lands the client on a canonical niche
        nid, sid, _ = resolve_niche(cur, niche_text or niche, create=True)
        if nid:
            cur.execute("update client_roster set niche_id=%s, sub_niche_id=%s where slug=%s",
                        (nid, sid, slug))
            niche_id = nid
    if niche_id:
        cur.execute("update master_sheet_pains set niche_id=%s where client_slug=%s and niche_id is null",
                    (niche_id, slug))
        cur.execute("update case_studies set niche_id=%s where owner_client_slug=%s and niche_id is null",
                    (niche_id, slug))
    # job buckets on any new pains that have a persona
    cur.execute("""select id, persona from master_sheet_pains
                   where client_slug=%s and persona is not null and job_function is null""", (slug,))
    for pid, persona in cur.fetchall():
        f, s = _buckets(persona)
        if f or s:
            cur.execute("update master_sheet_pains set job_function=%s, seniority=%s where id=%s",
                        (f, s, pid))
    return niche_id
