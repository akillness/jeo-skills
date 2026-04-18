# Loop Charter

## Goal
Improve the `presentation-builder` skill so it triggers more precisely, reflects real deck-production behavior, and becomes a smaller routing-first front door for deck artifacts instead of a long inline workflow essay.

## Current Baseline
- Current best version: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/presentation-builder/SKILL.md` on `main`
- Current issues: oversized front door (~284 lines), too much mode/detail inline, and not enough emphasis on the real packet + destination-surface decisions that govern deck work in practice.

## Mutable Artifact
Exactly one primary file: `.agent-skills/presentation-builder/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Existing repo conventions: routing-first front door, honest route-outs, support-file-backed detail, synced compact/discovery surfaces
- Validation prompts / acceptance tests: existing `evals/evals.json`, plus any added evals must test last-mile handoff and route-out behavior
- Success thresholds:
  - SKILL.md remains spec-compliant
  - trigger description stays precise and not broader than adjacent documentation/marketing skills
  - inline complexity shrinks while packet selection, handoff honesty, and route-outs get clearer
  - README / README.ko / setup prompt / compact discovery surfaces stay aligned if positioning changes materially

## Constraints
- Max time per iteration: one bounded cron run
- Max scope: one skill-centered improvement set plus directly dependent support/docs/wiki/graph files
- Forbidden edits: do not broaden the evaluator mid-run, do not create a duplicate neighboring deck skill, do not leave docs/discovery surfaces stale if the trigger surface changes materially
- Output format requirements: keep survey artifacts under `.survey/presentation-builder-structural-hardening-20260418/`; keep wiki updates append-only and graph outputs regenerated together if refreshed

## Tried Already
- Keep: prior repo-wide structural hardening passes that convert dense front doors into routing-first anchors with focused support packets
- Revert: adding another wrapper skill when bounded hardening of the existing canonical skill is enough
- Why: transferable repo-wide pattern; avoids noisy duplicates and keeps discovery surfaces coherent
