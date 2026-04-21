# Loop Charter

## Goal
Improve the existing `marketing-automation` skill with one bounded, transferable ratchet that makes the front door more truthful and more useful for real operator behavior.

## Current Baseline
`marketing-automation` already chooses one operating mode, one primary lane, and one packet. It still leaves manual coordination reality implied rather than explicit, and its brief shape can drift toward channel planning instead of a reusable operator packet.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/marketing-automation/SKILL.md`

Supporting surfaces may be updated only after the main ratchet is accepted:
- `references/`
- `evals/evals.json`
- `SKILL.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- wiki / graph artifacts if needed

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- JSON validity for edited manifests/evals via `python3 -m json.tool`
- Catalog/discovery sync via `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Trigger/contract review against this frozen rubric:
  1. one primary mode
  2. one primary lane
  3. one primary packet
  4. explicit route-outs to planning and Steam specialist work
  5. explicit proof / KPI handoff
  6. honest modeling of manual coordination / approvals / dependencies
- Dry-run prompts from existing evals plus at least one new approval/dependency or KPI-readout boundary case

## Constraints
- Max scope: one bounded ratchet on `marketing-automation`, not a broad marketing-cluster rewrite
- Prefer shrinking or clarifying over expanding into more channels
- No new overlapping broad marketing wrapper
- Keep changes transferable across SaaS/web/product/lifecycle/game-adjacent asks
- Update discovery/setup/docs surfaces if positioning/discoverability changes materially

## Tried Already
- Keep: 2026-04-12 canonicalized `marketing-automation` as the broad marketing front door
- Keep: 2026-04-18 structural hardening around five operating modes and sharper route-outs
- Revert direction: adding another broad marketing wrapper
- Revert direction: letting `marketing-automation` absorb Steam/store launch ops or PM planning
- Current hypothesis: strengthen the skill around one reusable operator packet that names owner, approvals/dependencies, and proof stack because that matches real operator behavior better than adding more tactic coverage
