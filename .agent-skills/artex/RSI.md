# Recursive self-improvement in ARTEX

Status: measurement and shadow memory only. There is no harness search, no
automatic adoption, and no self-modifying code in this repository.

This file defines the contract any future harness-optimization work must meet,
so the first experiment cannot quietly become an unguarded rewrite loop.

## The three loops

| loop | object | state |
|---|---|---|
| A. within a task | planner, worker, retester, adversarial gate | exists |
| B. across tasks | evidence-gated lessons from closed tasks | shadow mode, PR #104 |
| C. on the harness | prompts, skills, tool guidance | **not built**; this is its contract |

Loop A produces task gain. Loop B is meant to produce retained gain: a lesson
must survive a closed task and change a later one. Loop C is the only loop that
can produce improver gain, and it is the only one that can silently damage the
product, which is why it goes last.

## Loop C contract

Any PR that proposes, probes, or adopts harness edits must satisfy all of:

1. **Live tasks propose, benchmarks adopt.** A successful bounty task can
   generate a candidate lesson or edit, but it can never be the evidence for
   adoption. Adoption requires held-out benchmark runs, because a live task is
   unreproducible and contaminated by its target.
2. **Owner approval per adoption.** The loop may prepare a proposal branch and
   show the diff. It may not change the active prompt. Adoption is one explicit
   owner action, like a baseline pin.
3. **Immutable surfaces.** The following are never in the search space:
   the adversarial and quality gates, scope and authorization checks,
   prompt-injection defenses, tool allowlists, and the code-owned prompt tails
   (traffic tools, artifact rules, lesson block). Only the editable prompt body,
   skill markdown, and tool descriptions can be proposed.
4. **One-step rollback.** Every adopted prompt change is a new
   `agent_prompts` version, so rollback is a pointer change. Skills are files
   under git; no adoption may bypass review.
5. **Flag off by default.** The loop runs behind a feature flag. Turning it on
   requires an owner decision, and the flag is checked per run.
6. **Bounded edit budget.** A round may propose a bounded number of edits
   (annealed over rounds). A critic proposes only edits that are expected to
   transfer; a pruner rejects edits that only fit the probe task. This follows
   RRSI (arXiv 2609.24972).
7. **Attribution.** Probe results are compared against an unchanged baseline on
   the same task and seed. Regressions are attributed to a specific module
   rather than to the loop as a whole; the modular fault-localization idea is
   from ModularRSI (arXiv 2609.14857). A paired evolving/non-evolving comparison
   guards against misattributed safety regressions, following SEABench
   (arXiv 2609.35596).
8. **No self-approval and no silent state.** The loop cannot set its own status,
   edit its own acceptance criteria, or write to the lesson library as
   `adopted`. Lesson status changes stay owner actions.

A future Loop C PR is acceptable only with:

- a benchmark adapter and a held-out task set, independent of the tasks used to
  propose the edit;
- a baseline run and a candidate run with the same model, seed, budget, and
  judge;
- the judge independent of the subject model, with a falsification battery
  (the existing L3 runner already enforces this);
- per-gate results with denominators, not a single aggregate score;
- a written rollback path and the flag name.

## What the current layers do

- `GET /api/tasks/{id}/outcome` (PR #102) records what a task produced and what
  it cost: findings by disposition and severity, retest verdicts, tokens, tool
  calls, skill misses, wall time.
- `ARTEX_RSI_LESSONS=off|shadow|inject` (PR #104) extracts evidence-gated
  lessons from terminal tasks and, in `inject` mode, appends a code-owned
  data-not-instructions block after the planner and worker system prompts.
  Status stays `candidate`.
- `GET /api/skill-gaps` (PR #106) turns the existing miss ledger into a
  capability backlog.

None of these changes an agent's instructions on its own. Shadow mode exists to
measure whether retrieval helps before any harness edit is attempted.

## Credits

The admission rule (no lesson without cue, action, and evidence) and the
propose/probe/compose shape come from:

> Harness^2: Recursive Agent Harnessing for an Open World.
> Ruiyao Xu, Yanfei Chen, Zhongying CuiZhu, Bhavana Dalvi Mishra, Yifei Ming,
> Han Yu, Rujun Han, Chen-Yu Lee, Tomas Pfister. arXiv:2610.14224, 2026.
> Google Research. Apache-2.0. https://github.com/google-research/harness2

The evidence taxonomy used in the design (task gain, retained gain, improver
gain) and the implementation pointers come from:

> awesome-rsi, lobehub. https://github.com/lobehub/awesome-rsi

Specific ideas referenced above:

- RRSI: Regularized Recursive Self-Improvement of Agent Harnesses,
  arXiv:2609.24972 (annealed edit budget, critic and pruner).
- ModularRSI: Modular and Generalizable Recursive Harness Self-Improvement,
  arXiv:2609.14857 (module-level fault localization from success/failure
  contrast).
- SEABench: Benchmarking Endogenous Misalignment in Self-Evolving Agents,
  arXiv:2609.35596 (paired evolving/non-evolving attribution).
- Agentic Harness Engineering: Observability-Driven Automatic Evolution of
  Coding-Agent Harnesses, arXiv:2604.25850 (observable edits with predictions
  verified later, the same discipline as the benchmark gate here).
- A Safety in Self-Evolving Agents survey, arXiv:2610.00093 (why properties
  must survive accumulation and cross-context reuse, not just entry screening).

Only ideas are borrowed. ARTEX code is independent Go and Python; no source
from harness2 or the referenced projects is copied.
