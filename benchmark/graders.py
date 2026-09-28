"""Deterministic graders for the phase-1 benchmark.

A grader takes (case, run) and returns {score, pipeline_fired, reason}.
  score: 1 | 0 | "void" | "needs_human"
  pipeline_fired: bool

Boundary reminder: the harness NEVER writes copy. It runs each case through the playbook (which
holds the recipe) with Evergreen as the data provider, then grades the emitted run. MCQ and two
deterministic CONTAINS cases grade unsupervised here; everything else returns "needs_human" (Aaman
is ground truth on mechanism/copy JUDGE cases).

run shape: see trace_schema.json.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def load_cases():
    with open(os.path.join(HERE, "cases.json")) as f:
        return {c["id"]: c for c in json.load(f)["cases"]}


def pipeline_fired(case, run):
    """Precondition: every required_skill must appear in the trace as a fired skill."""
    fired = {s["name"].lower() for s in run.get("trace", []) if s.get("kind") == "skill"}
    need = {s.lower() for s in case.get("required_skills", [])}
    return need.issubset(fired)


def _all_text(run):
    parts = [run.get("output", {}).get("text", "") or ""]
    for v in run.get("output", {}).get("variants", []) or []:
        parts += [v.get("t1", "") or "", v.get("t2", "") or ""]
    return "\n".join(parts).lower()


def _t2s(run):
    return [(v.get("t2", "") or "") for v in run.get("output", {}).get("variants", []) or []]


def grade(case, run):
    # 1) precondition — if the playbook skills did not fire, the case is VOID, not failed.
    fired = pipeline_fired(case, run)
    if not fired:
        return {"score": "void", "pipeline_fired": False,
                "reason": f"required skills {case.get('required_skills')} not all in trace — routing, not copy"}

    if not case.get("auto"):
        return {"score": "needs_human", "pipeline_fired": True,
                "reason": f"{case['grade_type']} case — Aaman is ground truth; grade with the case's PASS rule"}

    chk = case.get("check", {})
    t = chk.get("type")

    if t == "mcq":
        ans = (run.get("answer") or "").strip().lower()
        correct = chk["correct"].lower()
        # accept the normalized answer token, or fall back to scanning the output for it
        hit = ans == correct or correct.replace("_", " ") in _all_text(run)
        return {"score": 1 if hit else 0, "pipeline_fired": True,
                "reason": f"answer={ans or '(none)'} correct={correct}"}

    if t == "must_not_match":
        text = "\n".join(_t2s(run)).lower() or _all_text(run)
        bad = [p for p in chk["patterns"] if p.lower() in text]
        return {"score": 0 if bad else 1, "pipeline_fired": True,
                "reason": f"forbidden phrase(s) present: {bad}" if bad else "no email-handoff ask in T2"}

    if t == "char_range":
        t1max = chk.get("t1_max_hint", 320)
        t2max = chk.get("t2_max_hint", 320)
        over = []
        for i, v in enumerate(run.get("output", {}).get("variants", []) or []):
            if len(v.get("t1", "") or "") > t1max:
                over.append(f"v{i} t1={len(v['t1'])}")
            if len(v.get("t2", "") or "") > t2max:
                over.append(f"v{i} t2={len(v['t2'])}")
        return {"score": 0 if over else 1, "pipeline_fired": True,
                "reason": f"over range: {over}" if over else "all variants within char range"}

    # count_and_ref / no_rung_0 / competitor_slot_sourced are semantic -> human for now
    return {"score": "needs_human", "pipeline_fired": True,
            "reason": f"check '{t}' needs a semantic read; grade with the PASS rule"}


def grade_all(runs):
    """runs: list of run dicts. Returns per-case results + the phase-1 scorecard."""
    cases = load_cases()
    results, void, mech, copy = [], 0, {"pass": 0, "of": 0}, {"pass": 0, "of": 0}
    for run in runs:
        case = cases.get(run["case_id"])
        if not case:
            continue
        r = grade(case, run)
        r["case_id"] = run["case_id"]
        results.append(r)
        bucket = mech if case["category"] == "mechanism" else copy
        if r["score"] == "void":
            void += 1
        else:
            bucket["of"] += 1
            if r["score"] == 1:
                bucket["pass"] += 1
    return {
        "results": results,
        "scorecard": {
            "pipeline_void": f"{void} / {len(runs)}",
            "mechanism": f"{mech['pass']} / {mech['of']}",
            "copy": f"{copy['pass']} / {copy['of']}",
        },
    }


if __name__ == "__main__":
    # smoke test with two synthetic runs
    demo = [
        {"case_id": "M-02", "answer": "b",
         "trace": [{"kind": "skill", "name": "mechanism-wordsmith"}], "output": {"text": "ship (b)"}},
        {"case_id": "CP-02",
         "trace": [{"kind": "skill", "name": "sms-draft"}, {"kind": "skill", "name": "qa-gate"}],
         "output": {"variants": [{"t1": "hi", "t2": "could I drop you an email w more info?"}]}},
    ]
    print(json.dumps(grade_all(demo), indent=2))
