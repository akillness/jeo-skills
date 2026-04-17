# Loop Charter

## Goal
Improve the existing `survey` skill so it matches the repo's routing-first structural-hardening pattern without weakening the canonical 4-lane survey artifact contract.

## Current Baseline
- `survey/SKILL.md` is 392 lines and sits on the graph watchlist as an oversized high-degree front door.
- The skill already has support coverage (`references/`, `evals/`, `SKILL.toon`), so the next win should come from boundary/shape cleanup rather than adding another research wrapper.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/survey/SKILL.md`

Supporting artifacts allowed only if they preserve or validate the new front door:
- `.agent-skills/survey/references/*`
- `.agent-skills/survey/evals/evals.json`
- `.agent-skills/survey/SKILL.toon`
- derived discovery surfaces (`skills.json`, `skills.toon`, README.md, README.ko.md, setup-all-skills-prompt.md`)

## Fixed Evaluation Harness
- Agent Skills structure/spec expectations via `.agent-skills/skill-standardization/SKILL.md` and `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Repo maintenance rule from `graphify-out/GRAPH_REPORT.md`: dense-anchor cleanup and truthful discovery surfaces matter more than new wrapper skills
- Dry-run usefulness checks:
  1. broken-search fallback survey
  2. repo-maintenance survey
  3. platform-comparison survey
  4. one-line bugfix non-trigger case
- Catalog/discovery sync check with `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills`

## Constraints
- One bounded skill only in this loop: `survey`
- Keep the 4-lane survey artifact contract intact
- No new overlapping research skill
- Keep changes reusable across developer workflow, web/fullstack, PM/ops, marketing/content, and game-maintenance runs
- Update discovery surfaces if the trigger/positioning changes materially

## Tried Already
- Keep: 2026-04-12 evidence-recovery hardening added support files and fallback labels
- Revert: adding another nearby research skill instead of improving the canonical survey entry point
- Why: support coverage is complete; the next gain comes from shrinking the front door and preserving portability
