"""Deterministic CTA extraction (no LLM, fast). The CTA is the closing ask — almost
always a SHORT question or explicit ask at the very END of the follow-up (T2, else T1).
Reject long pitch/proof lines; return None when there is no real CTA (so the field
stays clean and CTA clusters aren't polluted)."""
import re

# explicit ask signals, kept tight so mid-pitch words ("connect you with...") don't match
_SIG = re.compile(
    r"\b(worth (a|it|exploring|a look|a chat|a call|chatting|a convo|your time)|lmk|let me know|"
    r"open to|can i (show|share|walk|send|run)|happy to (share|show|send|walk)|want me to|shall i|"
    r"should i|hop on|jump on|grab (a|15|20|some)|catch up|let'?s connect|"
    r"you (open|around|free|available)|sound good|make sense|(this|next) week|quick (call|chat|word|q)|"
    r"1[05] ?min|20 ?min|calendar|down to (chat|talk)|get on a (call|quick)|worth it)\b", re.I)


def extract_cta(t1, t2):
    text = (t2 or "").strip() or (t1 or "").strip()
    if not text:
        return None
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
    if not sents:
        return None
    tail = sents[-3:]                       # the ask lives at the end
    for s in reversed(tail):                # 1. a short closing question
        if s.endswith("?") and len(s) <= 130:
            return s[:200]
    for s in reversed(tail):                # 2. a short explicit ask
        if len(s) <= 90 and _SIG.search(s):
            return s[:200]
    return None                            # no real CTA -> leave null
