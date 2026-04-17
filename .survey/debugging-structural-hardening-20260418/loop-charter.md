# Loop Charter

## Goal
Improve the `debugging` skill's trigger precision and execution clarity by shrinking the front door, preserving the reproduce → isolate → verify core loop, and sharpening handoffs to adjacent skills.

## Current Baseline
Current best version: `.agent-skills/debugging/SKILL.md` on `main` after the 2026-04-13 modernization pass.
Current quality: strong core workflow and support coverage, but still a dense/high-degree front door with room to move slower-changing mode detail into references and tighten route-in / route-out language.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/debugging/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/debugging`
- Discovery/catalog sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills`
- Real-usefulness rubric:
  1. clearer route-in / route-out boundaries vs `log-analysis`, `testing-strategies`, `code-review`, `performance-optimization`
  2. smaller front-door SKILL.md with slower-changing mode detail moved to support files
  3. eval coverage improves for realistic boundary cases rather than keyword stuffing
  4. docs/setup surfaces only change if positioning/discovery wording changes materially
- JSON validity checks for touched `evals/evals.json`, `graphify-out/graph.json`, and `.agent-skills/skills.json`

## Constraints
- Max one coherent improvement set this run
- Prefer improving the existing skill over adding a new one
- Keep support files focused and reusable
- Do not rewrite adjacent skills in the same loop
- Only keep changes that improve the fixed rubric more than the current baseline

## Tried Already
- Keep: 2026-04-13 modernization pass that established the reproduce → isolate → hypothesize → verify core loop and added references/evals
- Revert: adding another generic debugging wrapper or absorbing raw symptom-first log triage
- Why: the cluster works best with one diagnosis anchor plus adjacent specialist handoffs
