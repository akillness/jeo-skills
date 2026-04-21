# Loop Charter

## Goal
Tighten `skill-autoresearch` into a smaller routing-first repo-local ratcheting skill with clearer packet choice, sharper route-outs to hosted eval platforms and ML `autoresearch`, and support-surface sync that happens only after the core mutation is justified.

## Current Baseline
- Existing best version: `.agent-skills/skill-autoresearch/SKILL.md` on `main`
- Current weakness: the front door still mixes core routing, artifact package detail, evaluator construction, and support-surface sync into one long file.
- Current strength: the repo-local ratchet niche is already correct and should be preserved.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/skill-autoresearch/SKILL.md`

Supporting files allowed if the main ratchet proves out:
- `.agent-skills/skill-autoresearch/references/run-packets-and-route-outs.md`
- `.agent-skills/skill-autoresearch/evals/evals.json`
- `.agent-skills/skill-autoresearch/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki / survey / graph artifacts for this run

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/skill-autoresearch`
- `python3 -m json.tool .agent-skills/skill-autoresearch/evals/evals.json >/dev/null`
- `python3 -m json.tool .agent-skills/skills.json >/dev/null`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Manual rubric (frozen for this run):
  1. Trigger precision: clearer when to use vs not use
  2. Boundary clarity: explicit route-outs to `autoresearch` and hosted eval suites
  3. Execution clarity: one packet-first workflow with deterministic order
  4. Artifact usefulness: support doc holds verbose packet detail so front door can shrink
  5. Meta compliance: because the target is `skill-autoresearch` itself, the final result must still enforce frozen evaluators, keep/revert ratcheting, and append-only logs

## Constraints
- One meaningful main change: shrink and reroute the front door around packet choice
- Keep the repo-local ratchet contract intact; do not broaden into generic prompt/app observability
- No new overlapping skill
- Sync discovery surfaces only if the main skill wording changes materially
- Keep the run bounded to one implementation pass and one validation pass

## Tried Already
- Keep: 2026-04-16 hardening pass that introduced loop-charter and eval support
- Revert: any direction that merges `skill-autoresearch` into hosted eval platforms or the GPU-bound `autoresearch` workflow
- Why: the repo needs a markdown/git ratchet, not another platform wrapper
