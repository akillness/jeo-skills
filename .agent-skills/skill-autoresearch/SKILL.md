---
name: skill-autoresearch
description: >
  Improve an existing `SKILL.md` through a bounded eval-driven mutation loop.
  Use when a reusable skill needs sharper triggers, clearer instructions, or
  stronger support files and you want a frozen evaluation harness, one
  meaningful change per iteration, explicit keep-or-revert decisions, and
  append-only experiment logs instead of ad hoc rewriting. Triggers on:
  optimize this skill, eval my skill, improve this skill, benchmark this skill,
  skill mutation loop, ratchet this skill, run autoresearch on this skill.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Works best when the target skill has 3-5 representative prompts, 3-6 binary
  evals, and a deterministic way to inspect outputs or dry-run behavior.
metadata:
  tags: skill-autoresearch, skill-optimization, evals, prompt-iteration, benchmarking, mutation-loop, ratcheting, karpathy
  version: "1.1.0"
  source: https://github.com/olelehmann100kMRR/autoresearch-skill
---

# Skill Autoresearch

Use autoresearch as an operating model for skills, not as a vague “self-improve” slogan.

The loop is simple:
1. freeze the judge,
2. run a baseline,
3. change one meaningful thing,
4. score again,
5. keep only measured improvements,
6. log both wins and failures.

This skill is for **repo-local skill maintenance**. If the user needs a hosted eval platform, route to tools like LangSmith, Braintrust, Weave, or Promptfoo instead of pretending a markdown-only loop replaces them.

## When to use this skill

- A reusable `SKILL.md` works inconsistently and needs a repeatable improvement loop
- You want to benchmark a skill before editing it
- You need binary evals for trigger quality, execution clarity, or support-file usefulness
- You want append-only keep/discard history instead of ad hoc rewrites
- You need to improve a skill in git without moving the benchmark during the run
- You want a bounded way to add or refresh `references/`, `evals/`, compact variants, or discovery copy around a skill

## Do not use this skill when

- The user already knows the exact skill rewrite they want and does not need a benchmark loop
- The target has no representative prompts or no way to evaluate behavior
- The work is really about the underlying product/system, not the reusable skill instructions
- You are tempted to change the skill and the evaluator at the same time with no frozen baseline

## Required inputs

Do not start the loop until these are known:

1. Target skill path
2. Three to five representative prompts
3. Three to six binary yes/no evals
4. Runs per experiment, default `3`
5. Optional effort cap: iteration count, time budget, or tool budget
6. What files are in scope beyond `SKILL.md` (for example `references/`, `evals/`, `SKILL.toon`, docs surfaces)

Use these support files before editing:
- `references/eval-guide.md` — turning vague quality claims into binary checks
- `references/loop-charter-template.md` — freezing the run contract before mutations begin

## Artifact package

Create a repo-local experiment folder next to the target skill:

```text
skill-autoresearch-[skill-name]/
  loop-charter.md
  dashboard.html
  results.json
  results.tsv
  changelog.md
  SKILL.md.baseline
```

Minimum artifact expectations:
- `loop-charter.md` freezes the goal, baseline, mutable artifact, evaluator, and constraints for the run
- `results.tsv` stores one row per experiment
- `results.json` powers the dashboard or any later structured analysis
- `changelog.md` records both kept and reverted changes in plain language
- `SKILL.md.baseline` preserves the untouched starting point

## Instructions

### Step 1: Read the target skill and supporting files

1. Read the target `SKILL.md`
2. Read linked files under `references/`, `evals/`, `scripts/`, or compact variants if they exist
3. Identify:
   - the skill's real job
   - what should trigger it
   - what it explicitly routes out
   - likely failure modes
4. Note contradictions, buried instructions, weak trigger wording, and missing support coverage before editing anything

### Step 2: Freeze the evaluator

Before changing the skill, write `loop-charter.md`.

The charter must freeze:
- the goal of the run
- the current baseline
- the single primary mutable artifact
- the fixed evaluation harness
- allowed supporting files
- time / iteration / tool budget
- rejected directions for this run

Rules:
- Do **not** change the evaluator mid-run unless the human explicitly requests a new comparison track
- Keep one primary mutable artifact even if supporting files change around it
- Prefer dry-run checks that another maintainer could rerun tomorrow

### Step 3: Build the eval suite

Convert quality criteria into binary checks only.

Use this format:

```text
EVAL 1: Short name
Question: Yes/no question about the output or artifact
Pass: Specific condition that counts as yes
Fail: Specific condition that counts as no
```

Strong eval categories for skill work:
- **Trigger quality** — does the description clearly say when to use the skill?
- **Boundary clarity** — does it route neighboring jobs elsewhere instead of becoming a catch-all?
- **Execution clarity** — are steps deterministic and ordered?
- **Artifact usefulness** — are support files or output expectations concrete enough to reuse?
- **Benchmark discipline** — does the loop freeze the test set and evaluator before edits?

Rules:
- use binary yes/no checks only
- prefer observable checks over taste-based judgments
- keep evals distinct; do not score the same failure twice
- use the same prompt set for baseline and mutations inside a run

### Step 4: Establish the baseline

1. Copy the original skill to `SKILL.md.baseline`
2. Run the current skill against the fixed prompt set
3. Score every run against every eval
4. Record experiment `0` as the baseline
5. Summarize what is failing before you edit anything

Use this `results.tsv` header:

```text
experiment	score	max_score	pass_rate	status	description
```

If the target already passes comfortably, stop and report that no ratchet is justified.

### Step 5: Run one-change iterations

This is the core loop:

1. Read the failing outputs and artifacts
2. Form one hypothesis about the failure
3. Make one meaningful change only
4. Re-run the same prompt set and eval suite
5. Compare to the baseline and current best
6. Keep only score-improving changes
7. Revert ties or regressions
8. Append the outcome to `results.tsv`, `results.json`, and `changelog.md`

Good mutations:
- tightening a weak trigger description
- moving a critical rule higher
- adding one focused example or route-out
- adding one support file that closes a clear usability gap
- removing a noisy instruction that causes over-triggering

Bad mutations:
- rewriting the whole skill and support layer at once
- changing the skill and the evaluator together
- keyword stuffing for recall without improving precision
- adding docs/setup changes before the skill boundary is stable
- optimizing for style instead of measured behavior

### Step 6: Validate support surfaces when needed

If the change materially affects discoverability, onboarding, naming, or usage, also update:
- discovery manifests such as `skills.json` / compact indexes
- docs/setup surfaces such as `README.md`, localized README entries, or setup prompts
- compact skill variants when the repo ships them

Do this **after** the main skill change is justified by the frozen evaluator, not before.

### Step 7: Log every experiment

Append after every iteration:

```markdown
## Experiment N — keep|revert

Score: X/Y
Change: one-sentence mutation summary
Hypothesis: why this mutation was tried
Result: what improved or regressed
Remaining failures: what still breaks
```

Discarded experiments matter. They prevent future maintainers from rediscovering the same bad idea.

### Step 8: Deliver results

When the loop stops, report:

1. baseline score to final score
2. number of experiments run
3. keep vs revert count
4. top changes that helped most
5. remaining failure patterns
6. artifact locations
7. whether docs/setup/discovery surfaces were updated

## Examples

### Example 1: Tighten a stale trigger description

Input situation:
- Skill triggers too broadly
- No evals for neighboring skills
- Maintainer wants bounded improvement, not a rewrite

Expected loop:
1. Freeze 3 prompts and 4 binary evals
2. Baseline current trigger behavior
3. Rewrite description only
4. Keep only if precision improves without losing core recall

### Example 2: Add missing support files after boundary is proven

Input situation:
- The skill boundary is sound, but reuse is weak because there is no reference doc or eval file

Expected loop:
1. Validate the core `SKILL.md` boundary first
2. Add one reference or `evals/evals.json`
3. Re-run the same harness
4. Update discovery surfaces only if the positioning changed materially

## Best practices

1. Freeze the evaluator before the first edit
2. Change one meaningful thing at a time
3. Prefer representative real-world prompts over invented perfect cases
4. Use repeated runs when non-determinism matters
5. Keep the loop bounded; short comparable iterations beat heroic rewrites
6. Log failed experiments, not just successes
7. Prefer transferable improvements over narrow benchmark gaming
8. Treat hosted eval products as references, not replacements, for repo-local skill ratchets
9. If the skill body changes materially, sync discovery manifests and compact variants in the same bounded run

## References

- [Upstream autoresearch-skill](https://github.com/olelehmann100kMRR/autoresearch-skill)
- [Karpathy/autoresearch](https://github.com/karpathy/autoresearch)
- [Promptfoo](https://github.com/promptfoo/promptfoo)
- [LangSmith Evaluation](https://docs.langchain.com/langsmith/evaluation)
