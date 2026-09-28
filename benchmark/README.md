# Evergreen + Playbook Benchmark Harness (phase 1)

Runs Aaman's 16 phase-1 cases (7 mechanism, 9 copy) from `BENCHMARK-CASES.md`, captures a full
trace of each run, and scores it. Built to the architecture agreed in the 2026-09-25 sync.

## The boundary this harness is built on (do not violate)

- **Evergreen is the data + insight provider.** It serves retrieval, benchmarks (`/api/benchmark-copy`),
  learnings, call-insights, stats. It does NOT write copy and does NOT hold the SMS recipe.
- **The playbook is the reasoner + writer.** Aaman's skills (`sms-brief`, `case-study-developer`,
  `mechanism-wordsmith`, `sms-draft`, `campaign-director`) hold the prompts/recipe/voice/QA. They
  turn Evergreen's data into mechanism and copy.

Therefore a copy/mechanism case is executed by running it **through the playbook**, with Evergreen
only feeding data. The harness never writes copy itself, and it never grades Evergreen on copy
quality — copy quality is the playbook's output, using Evergreen's data.

## The precondition (checked first, every case)

Before a case is scored, the trace must show **the playbook skills actually fired** (sms-draft ran,
the voice profile loaded, the QA gate ran; for mechanism cases, mechanism-wordsmith ran).

- Skills fired  -> grade the case (1 / 0).
- Skills did NOT fire -> the case is **void, not failed** (`PIPELINE FIRED: no`).

Skills do not self-activate. A high void count is itself the finding, and the fix is routing, not
copy (this is exactly the 2026-09-25 YS Digital false alarm).

Every result carries two fields:

```
PIPELINE FIRED:  yes / no
SCORE:           1 / 0 / void
```

## How a case runs

1. A Claude agent is spawned with the **playbook skills loaded** and **Evergreen API access**
   (`Authorization: Bearer $EVERGREEN_API_KEY`), given the case INPUT.
2. It runs the real path: playbook skills reason/write; Evergreen calls supply the data.
3. The agent emits a **trace** (ordered): every Evergreen endpoint hit (with a result summary) and
   every playbook skill fired, in order — plus the final OUTPUT.
4. `pipeline_fired` is derived from the trace (did the required skills run).
5. Grading:
   - `MCQ` / `CONTAINS` -> deterministic, `graders.py`, unsupervised.
   - `JUDGE` -> deferred to Aaman (or an aligned judge later). The decision rule is on the case.

The trace matters more than the score: a case that passes for the wrong reason is worse than one
that fails, and only the trace shows the difference.

## Files

- `cases.json` — the 16 phase-1 cases, machine-readable, each with an explicit binary PASS rule.
- `graders.py` — deterministic graders for MCQ and CONTAINS; JUDGE returns `needs_human`.
- `trace_schema.json` — the shape every run's trace must emit (so the artifact can render it).
- (runner + trace artifact: wired next — the agent-per-case executor and the flowchart output.)

## Scoring (reported separately, never as one number)

```
PIPELINE FIRED   _ / 16      (void cases, not failures)
MECHANISM        _ / 7
COPY             _ / 9
```

Then, for every failure, the phase-2 backlog line (walk the trace back to the earliest stage that
made the failure inevitable):

```
CASE  __   earliest stage that made this inevitable: __________
```

## Ground truth

On mechanism and copy, **Aaman's answer is ground truth** and is not amended. Technical checks are
added on top, never to override his answer.
