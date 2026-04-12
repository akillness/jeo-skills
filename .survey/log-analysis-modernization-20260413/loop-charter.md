# Loop Charter

## Goal
Improve the existing `log-analysis` skill so it is more reusable, boundary-safe, and practically useful for read-only root-cause triage across developer CLI logs, web/browser-plus-backend debugging, and general incident log review.

## Current Baseline
- `log-analysis` is a short legacy skill centered on grep/awk snippets.
- It lacks `references/` and `evals/`.
- Its current description and workflow do not clearly separate it from `debugging`, `monitoring-observability`, or `game-build-log-triage`.

## Mutable Artifact
Primary file: `.agent-skills/log-analysis/SKILL.md`

Supporting files allowed if the primary rewrite proves better:
- `.agent-skills/log-analysis/SKILL.toon`
- `.agent-skills/log-analysis/references/*`
- `.agent-skills/log-analysis/evals/evals.json`
- repo discovery surfaces if positioning materially changes (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`)
- survey/wiki/graph artifacts documenting the decision

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Description must clearly indicate triggers and boundaries
- Workflow must stay read-only and investigation-first
- Must explicitly hand off engine-specific Unity/Unreal build logs to `game-build-log-triage`
- Must distinguish log triage from observability setup (`monitoring-observability`) and general bug-fixing (`debugging`)
- Validation commands:
  - `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/log-analysis`
  - `python3 -m json.tool .agent-skills/log-analysis/evals/evals.json`
  - `python3 -m json.tool .agent-skills/skills.json`

## Constraints
- One meaningful skill modernization pass only; no second unrelated skill this run
- Prefer a transferable root-cause-first workflow over a vendor- or stack-specific command dump
- Keep all command suggestions read-only
- No new overlapping logging/observability skill

## Tried Already
- Keep: modernize existing high-traffic legacy skills with clearer boundaries and support bundles
- Revert: adding overlapping wrappers when a boundary-first rewrite of an existing skill is sufficient
- Why: prior successful runs improved reuse and discoverability without increasing catalog noise
