# Loop Charter

## Goal
Improve `fabric` by shrinking it into a faster routing-first front door without weakening its durable boundary as the canonical Fabric skill.

## Current Baseline
`fabric/SKILL.md` is accurate and support-backed, but still 308 lines and listed on the graph watchlist as an oversized front-door skill.

## Mutable Artifact
Primary: `.agent-skills/fabric/SKILL.md`

Supporting context files that may need synchronized updates if the primary artifact changes materially:
- `.agent-skills/fabric/SKILL.toon`
- `.agent-skills/fabric/evals/evals.json`
- `.agent-skills/fabric/references/*`
- `.agent-skills/skills.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills-wiki/*`
- `graphify-out/*`

## Fixed Evaluation Harness
- Agent Skills spec compliance via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality: `fabric` must still clearly own reusable named pattern transforms, custom patterns, shell composition, and server mode
- Boundary quality: route-outs to coding assistants, generic LLM CLIs, and workflow automation must remain explicit
- Dry-run prompts: transcript summary, custom pattern pack, Fabric-vs-LLM-CLI boundary review
- Repo hygiene: compact/discovery surfaces stay synced when wording changes materially

## Constraints
- One bounded conceptual change this run: structural hardening of the existing `fabric` skill
- No new overlapping Fabric-adjacent skill
- Keep the front door shorter and more decisive than baseline
- Preserve source-backed references in survey/wiki artifacts

## Tried Already
- Keep: 2026-04-15 modernization into six modes with references/evals/docs sync
- Revert: adding another Fabric-adjacent wrapper; broadening Fabric into generic AI CLI positioning
- Why: durable boundary already exists; the remaining problem is structural weight, not missing surface area
