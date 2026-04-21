# Loop Charter

## Goal
Improve the `web-accessibility` skill so it triggers more precisely, routes adjacent frontend work more honestly, and produces a smaller, more reusable remediation/verification front door.

## Current Baseline
- Current best version: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/web-accessibility/SKILL.md` on `main`
- Current issues: oversized front door (~290 lines), some support detail still inline instead of packaged into tighter routing packets, and room to sharpen the boundary with adjacent frontend/design skills.

## Mutable Artifact
Exactly one primary file: `.agent-skills/web-accessibility/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Existing repo conventions: routing-first front door, honest route-outs, support-file-backed detail, synced compact/discovery surfaces
- Validation prompts / acceptance tests: existing `evals/evals.json`, plus any added evals must test route-outs and packet-first output behavior
- Success thresholds:
  - SKILL.md remains spec-compliant
  - trigger description stays precise and not broader than neighboring frontend skills
  - routing and verification output become clearer while total inline complexity shrinks
  - support/docs surfaces stay in sync if the trigger surface changes materially

## Constraints
- Max time per iteration: one bounded cron run
- Max scope: one skill-centered improvement set plus directly dependent support/docs/wiki/graph files
- Forbidden edits: do not broaden the evaluator mid-run, do not create a duplicate neighboring skill, do not leave docs/discovery surfaces stale if the positioning changes materially
- Output format requirements: keep survey artifacts under `.survey/web-accessibility-structural-hardening-20260418/`; keep wiki updates append-only and graph outputs regenerated together if refreshed

## Tried Already
- Keep: prior frontend hardening passes that converted dense anchors into routing-first front doors with focused support packets
- Revert: adding adjacent wrapper skills when bounded structural hardening of the existing anchor is enough
- Why: transferable repo-wide pattern; avoids noisy duplicates and keeps discovery surfaces coherent
