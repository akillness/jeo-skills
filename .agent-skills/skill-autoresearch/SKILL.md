---
name: skill-autoresearch
description: >
  Route reusable skill-improvement work into one bounded repo-local ratcheting packet:
  ratchet eligibility, benchmark readiness, loop charter freeze, baseline scoring,
  one-change mutation, support-surface sync, or final keep/revert report. Use when an
  existing `SKILL.md`, SOP, prompt, or workflow doc may need sharper triggers, clearer
  instructions, better support files, or cleaner discovery wording and you want a
  frozen evaluation harness, append-only experiment logs, and explicit keep-or-revert
  decisions instead of ad hoc rewriting. Also use when you need to prove that no
  ratchet is justified yet. Not for GPU-bound Karpathy `autoresearch` runs or hosted
  app-scale eval / observability platforms such as LangSmith, Braintrust, Weave, or
  Promptfoo.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Works best when the target artifact has 3-5 representative prompts or scenarios,
  3-6 binary checks, and a deterministic way to inspect outputs or dry-run behavior.
metadata:
  tags: skill-autoresearch, skill-optimization, evals, prompt-iteration, benchmarking, mutation-loop, ratcheting, karpathy
  version: "1.2.0"
  source: https://github.com/olelehmann100kMRR/autoresearch-skill
---

# Skill Autoresearch

Use this skill when the job is **improving a reusable repo artifact with a frozen local benchmark**.

The contract is simple: first decide whether a ratchet is justified at all, then freeze the judge, baseline the current artifact, change one meaningful thing only when needed, rerun the same harness, keep only measured improvements, and log both wins and reverts.

This skill is intentionally **repo-local**. It owns markdown/git-friendly ratchets for `SKILL.md`, SOPs, prompts, templates, and workflow docs. If the real need is product-scale traces, hosted dashboards, or app/runtime evaluation, route out instead of pretending this skill replaces LangSmith, Braintrust, Weave, or Promptfoo.

Read these support files before editing:
- [references/eval-guide.md](references/eval-guide.md)
- [references/loop-charter-template.md](references/loop-charter-template.md)
- [references/run-packets-and-route-outs.md](references/run-packets-and-route-outs.md)

## When to use this skill
- A reusable `SKILL.md` or workflow document works inconsistently and needs a bounded improvement loop.
- You need to decide whether the current artifact even deserves another ratchet, or whether `no ratchet justified` is the correct outcome.
- You want to tighten triggers, route-outs, or execution steps without moving the benchmark mid-run.
- You need to add or refresh `references/`, `evals/`, compact variants, or discovery wording only after the main boundary is proven.
- You need append-only keep/revert history that survives in git and PR review.
- You want a repeatable answer to “did this edit actually improve the artifact?”

## Do not use this skill when
- The user already knows the exact rewrite they want and does not need a benchmark loop.
- The target has no representative prompts or no stable way to evaluate behavior.
- The work is really about running GPU-bound `karpathy/autoresearch` experiments on `train.py` / `program.md` / `val_bpb` → use `autoresearch`.
- The work is really about hosted prompt or app evaluation, production traces, large datasets, or experiment dashboards → route to LangSmith, Promptfoo, Braintrust, or Weave.
- You are about to change the artifact and the evaluator at the same time.

## Required inputs
Do not start mutation work until you know the target artifact, 3-5 representative prompts or scenarios, 3-6 binary evals, a rerun/budget rule, and which supporting files are allowed beyond the primary artifact.

Before that, decide whether there is evidence for one of three outcomes:
- the baseline likely fails and needs a real ratchet,
- the main artifact is fine but support surfaces drifted,
- or no ratchet is justified yet.

## Instructions

### Step 1: Choose one packet
Normalize the request into **one primary packet** before editing anything.

```yaml
skill_autoresearch_packet:
  primary_packet: ratchet-eligibility | benchmark-readiness | charter-freeze | baseline-score | one-change-mutation | support-sync | final-report | route-out
  target_artifact: SKILL.md | SOP | prompt-template | workflow-doc | other
  evidence_shape: prompts-and-evals | dry-run-checklist | repo-validators | mixed | unknown
  support_scope: none | references-only | evals-only | compact-only | discovery-surfaces | mixed
  confidence: high | medium | low
```

Packet meanings:
- `ratchet-eligibility` — decide whether the run should stop as `no ratchet justified`, jump to `support-sync`, or continue into a real benchmark loop
- `benchmark-readiness` — the loop cannot start until prompts/evals/scope are frozen
- `charter-freeze` — write the loop contract before any mutation
- `baseline-score` — snapshot the current artifact and record experiment `0`
- `one-change-mutation` — make exactly one meaningful change, rerun, keep or revert
- `support-sync` — update compact/docs/manifests only after the core ratchet is justified or when the main artifact is already good and only support surfaces drifted
- `final-report` — summarize baseline → final delta, keep/revert count, and remaining failures
- `route-out` — the request actually belongs to hosted eval tooling or ML `autoresearch`

### Step 2: Read the target and neighboring surfaces
Read the primary artifact first, then only the support surfaces that matter:
- linked `references/`, `evals/`, `scripts/`, or compact variants
- README/setup/manifest wording if discoverability may change
- prior loop artifacts if a ratchet already exists

Capture:
- the artifact's real job
- what should trigger it
- what it should route out
- current failure modes
- any stale discovery wording or support drift
- whether the likely next state is `no ratchet justified`, `support-sync`, or a real mutation loop

### Step 3: Decide ratchet eligibility before freezing the loop
Before writing a charter, answer three things:
1. Does the baseline already appear to satisfy the current bar?
2. Is the real problem only support-surface drift?
3. Is there concrete evidence that a ratchet is still worth the churn?

If the answers point to `no ratchet justified`, stop and report that outcome.
If the main artifact is already good but docs/manifests/compact surfaces drifted, route to `support-sync` instead of pretending a mutation loop happened.
Only continue into the benchmark loop when the baseline genuinely fails or when there is explicit evidence-backed headroom worth pursuing.

### Step 4: Freeze the evaluator
Before editing, write `loop-charter.md`.

The charter must freeze:
- goal of the run
- current baseline
- one primary mutable artifact
- fixed evaluation harness
- supporting files allowed in scope
- time / iteration / tool budget
- rejected directions for this run

Rules:
- do **not** change prompts, eval wording, or scoring rules mid-run
- if the evaluator changes, start a new comparison track
- keep one primary mutable artifact even if supporting files change later

### Step 5: Build binary evals only
Use [references/eval-guide.md](references/eval-guide.md).

Strong eval categories for skill and workflow artifacts:
- trigger precision
- route-out clarity
- execution determinism
- artifact usefulness
- benchmark discipline
- discovery-surface sync (only if the run changes positioning)

Rules:
- use yes/no checks only
- prefer observable checks over taste
- do not score the same failure twice
- use the same prompt set for baseline and mutation runs

### Step 6: Baseline the current artifact
1. copy the current version to a baseline artifact such as `SKILL.md.baseline`
2. record experiment `0`
3. score the current version on the frozen harness
4. summarize the failures before mutating anything

Decision gate:
- If the baseline already passes comfortably and there is no material support drift, stop and report `no ratchet justified`.
- If the baseline is good and only compact/docs/manifests drifted, jump to `support-sync` and say so explicitly.
- Only continue to mutation when the baseline actually fails or the charter names clear evidence-backed headroom worth pursuing.

### Step 7: Run one-change mutations
This is the core loop:
1. inspect the failing outputs or artifact surfaces
2. form one hypothesis
3. change one meaningful thing only
4. rerun the same harness
5. compare against the baseline and current best
6. keep only score-improving changes
7. revert ties or regressions unless the charter explicitly prefers a secondary metric such as lower ambiguity or smaller front-door size
8. append the outcome to the run log

Good mutations:
- tighten a weak trigger description
- move a critical boundary rule higher
- add one focused support file that closes a clear usability gap
- remove a noisy instruction that causes over-triggering
- shrink a bloated front door by moving stable detail into a reference

Bad mutations:
- rewriting the skill and evaluator together
- broad multi-file churn before the core boundary is proven
- keyword stuffing for recall
- optimizing for style instead of measured behavior

### Step 8: Sync support surfaces only after the ratchet holds
If the main change materially affects discoverability, onboarding, naming, or usage, then sync:
- `evals/evals.json`
- compact variants such as `SKILL.toon`
- discovery manifests such as `skills.json` / compact indexes
- docs/setup surfaces such as `README.md`, localized README entries, or setup prompts

Do this **after** the main artifact improvement is justified by the frozen evaluator.

### Step 9: Log every experiment
Use append-only artifacts. Minimum package:
- `loop-charter.md`
- baseline copy
- structured results (`results.tsv`, `results.json`, or equivalent)
- plain-language changelog / experiment log

Every experiment should record:
- keep or revert
- score delta
- one-sentence mutation summary
- hypothesis
- remaining failures

### Step 10: Apply the rule to this skill too
If the target artifact is `skill-autoresearch` itself, do not exempt it from the loop.

Validate:
- the target skill against the frozen rubric
- support-surface sync only after the main ratchet holds
- the final wording still preserves frozen evaluators, one-change iterations, append-only logs, and explicit keep/revert decisions

## Output format
Return a compact ratchet report:

```markdown
# Skill Autoresearch Report

## Packet
- Primary packet:
- Target artifact:
- Why this packet fits:

## Frozen harness
- Prompts / scenarios:
- Binary evals:
- Validators:
- Scope limits:

## Baseline
- Current score:
- Main failures:

## Mutation result
- Change tried:
- Keep or revert:
- Score delta:
- Remaining failures:

## Support sync
- Updated surfaces:
- Deferred surfaces:

## Next state
- Recommended next move:
- Artifact paths:
```

## Examples

### Example 1: Trigger repair
**Input**
> Improve this stale skill. It over-triggers and I want a bounded loop, not a rewrite.

**Good direction**
- packet: `one-change-mutation`
- freeze prompts/evals first
- rewrite description or route-out wording only
- keep or revert by measured result

### Example 2: Benchmark drift repair
**Input**
> I keep changing the tests while rewriting the skill. Help me optimize it anyway.

**Good direction**
- packet: `benchmark-readiness` or `charter-freeze`
- stop the run from proceeding until the evaluator is frozen
- instruct the maintainer to start a new comparison track if the judge must change

### Example 3: Discovery-surface follow-up
**Input**
> The skill is better now. README, setup prompt, and compact wording may be stale.

**Good direction**
- packet: `support-sync`
- only after the main ratchet is proven, or because the main artifact is already fine and only support surfaces drifted
- sync manifests/docs without pretending that broad doc churn was the main experiment

### Example 4: No-ratchet outcome
**Input**
> The current skill already passes our frozen checks and reviewer feedback is good. I just feel like tuning it more.

**Good direction**
- packet: `ratchet-eligibility`
- conclude `no ratchet justified` unless the maintainer can name concrete evidence-backed headroom
- protect the passing baseline from churn

### Example 5: Route-out
**Input**
> I need online traces, dataset comparisons, and hosted dashboards for our app prompts.

**Good direction**
- packet: `route-out`
- explain that the job belongs to LangSmith, Promptfoo, Braintrust, or Weave rather than repo-local skill ratcheting

## Best practices
1. Make `no ratchet justified` a valid success state instead of assuming every run needs mutation.
2. Freeze the evaluator before the first real edit.
3. Keep one primary mutable artifact even when support files are in scope.
4. Change one meaningful thing at a time.
5. Prefer representative prompts over perfect toy cases.
6. Log failed experiments, not just successes.
7. Treat smaller front doors as a valid secondary win only when the same harness still passes.
8. Sync compact/docs/manifests only after the main ratchet holds.
9. Keep the boundary sharp between repo-local skill maintenance, hosted eval platforms, and ML `autoresearch`.

## References
- [Upstream autoresearch-skill](https://github.com/olelehmann100kMRR/autoresearch-skill)
- [Karpathy/autoresearch](https://github.com/karpathy/autoresearch)
- [Promptfoo](https://github.com/promptfoo/promptfoo)
- [LangSmith Evaluation](https://docs.langchain.com/langsmith/evaluation)
