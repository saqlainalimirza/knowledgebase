"""Transcript chunker — turn-by-turn, ~400 tokens per chunk with 50-token overlap.

Handles two speaker layouts, then falls back to blind char windows only when neither
is present:
  1. Inline:      "Name: what they said"                 (one line per turn)
  2. Timestamped: "Name" / "" / "10:03 pm" / "text..."   (Fathom / Fireflies / Zoom
                  exports — the speaker name is on its own line, followed by a bare
                  timestamp line, then the utterance). This is the common export shape
                  and previously fell through to blind slicing, mixing speakers and
                  keeping UI chrome/filler.
"""
import re

SPEAKER_RE = re.compile(r"^\s*([A-Z][\w .'\-]{0,40}):\s")
# a bare timestamp line: 10:03, 10:03 pm, 1:22:33, 01:22:33 PM (optionally with a /total)
TS_RE = re.compile(r"^\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s*(?:/\s*\d{1,2}:\d{2}(?::\d{2})?)?\s*$",
                   re.IGNORECASE)
# a plausible speaker-name line: 1-4 word-ish tokens, letters only (no sentence punctuation)
NAME_LINE_RE = re.compile(r"^\s*[A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*){0,3}\s*$")
TARGET_TOKENS = 400
MAX_TOKENS = 512
OVERLAP_TOKENS = 50


def _tokens(text):
    return max(1, len(text) // 4)


def _group_turns(text):
    """Inline 'Name: text' layout."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    turns, current = [], []
    for ln in lines:
        if SPEAKER_RE.match(ln) and current:
            turns.append("\n".join(current))
            current = [ln]
        else:
            current.append(ln)
    if current:
        turns.append("\n".join(current))
    return turns


def _group_turns_timestamped(text):
    """Fathom/Fireflies layout: a speaker-name line whose FIRST following non-blank line
    is a bare timestamp. Returns a list of 'Speaker: utterance' turns, or None if this
    layout isn't present (fewer than 3 such boundaries)."""
    lines = text.splitlines()
    n = len(lines)
    boundaries = []  # indices of speaker-name lines
    for i, ln in enumerate(lines):
        if not ln.strip() or TS_RE.match(ln) or not NAME_LINE_RE.match(ln):
            continue
        # the very next non-blank line must be a timestamp for this to be a turn header
        for j in range(i + 1, n):
            if not lines[j].strip():
                continue
            if TS_RE.match(lines[j]):
                boundaries.append(i)
            break
    if len(boundaries) < 3:
        return None
    turns = []
    for k, b in enumerate(boundaries):
        end = boundaries[k + 1] if k + 1 < len(boundaries) else n
        speaker = lines[b].strip()
        body = [ln.strip() for ln in lines[b + 1:end] if ln.strip() and not TS_RE.match(ln)]
        if body:
            turns.append(f"{speaker}: " + " ".join(body))
    return turns if len(turns) >= 3 else None


def _overlap_tail(turns):
    tail, total = [], 0
    for t in reversed(turns):
        tail.insert(0, t)
        total += _tokens(t)
        if total >= OVERLAP_TOKENS:
            break
    return tail


def _pack(turns):
    """Pack turns into ~TARGET_TOKENS chunks with a small carried overlap."""
    chunks, cur, cur_tokens = [], [], 0
    for turn in turns:
        tt = _tokens(turn)
        if cur and cur_tokens + tt > TARGET_TOKENS:
            chunks.append("\n".join(cur))
            cur = _overlap_tail(cur)
            cur_tokens = sum(_tokens(x) for x in cur)
        cur.append(turn)
        cur_tokens += tt
        if cur_tokens >= MAX_TOKENS:
            chunks.append("\n".join(cur))
            cur = _overlap_tail(cur)
            cur_tokens = sum(_tokens(x) for x in cur)
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def _fixed_windows(text):
    size = TARGET_TOKENS * 4
    overlap = OVERLAP_TOKENS * 4
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks


def chunk_transcript(text):
    # 1) inline "Name:" turns — require several so a stray "Call 3:" header doesn't flip us
    turns = _group_turns(text)
    speaker_turns = sum(1 for t in turns
                        if t.splitlines() and SPEAKER_RE.match(t.splitlines()[0]))
    if speaker_turns >= 3:
        return _pack(turns)
    # 2) timestamped export layout (Fathom / Fireflies / Zoom)
    ts_turns = _group_turns_timestamped(text)
    if ts_turns:
        return _pack(ts_turns)
    # 3) no speaker structure at all — blind windows
    return _fixed_windows(text)
