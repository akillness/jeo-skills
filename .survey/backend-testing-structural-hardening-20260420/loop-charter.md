# Loop Charter

## Goal
Improve `backend-testing` so it triggers more precisely on backend implementation packets and routes policy / contract-shape / auth-implementation work away faster.

## Current Baseline
Current `backend-testing/SKILL.md` is useful and support-backed, but its front door is still long enough to blur packet selection. It already covers layers, dependencies, fixtures, and CI splits, yet it does not start from a crisp intake packet in the same way newer structural-hardening passes do.

## Mutable Artifact
Primary: `.agent-skills/backend-testing/SKILL.md`

Supporting context that may be updated only if the primary change holds:
- `.agent-skills/backend-testing/references/intake-packets-and-route-outs.md`
- `.agent-skills/backend-testing/SKILL.toon`
- `.agent-skills/backend-testing/evals/evals.json`
- discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- survey/wiki/graph artifacts for this run

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/backend-testing`
- JSON validity via `python3 -m json.tool .agent-skills/backend-testing/evals/evals.json >/dev/null`
- Catalog/runtime sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Trigger-quality rubric:
  - starts from one packet-first intake
  - keeps `testing-strategies`, `api-design`, and `authentication-setup` route-outs explicit
  - preserves backend implementation ownership
  - improves clarity without expanding scope

## Constraints
- Max one coherent structural change set in this run
- No new overlapping testing skill
- Keep support surfaces synced if the trigger surface changes materially
- Prefer patching existing docs over adding noisy new files

## Tried Already
- Keep: the 2026-04-12 modernization pass that established backend coverage, fixture strategy, dependency realism, and CI-vs-local execution as the skill’s core job.
- Revert: any move that broadens `backend-testing` into whole-org test policy, API contract design, or auth implementation.
- Why: the repo’s cluster boundaries already work; this run should harden the front door, not reopen the lane split.
