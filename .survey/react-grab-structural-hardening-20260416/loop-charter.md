# Loop Charter

## Goal
Improve the practical usability and maintenance shape of `.agent-skills/react-grab` without creating a duplicate skill.

## Current Baseline
- `SKILL.md` is 494 lines and mixes routing, setup, framework-specific installation, agent integration, plugin/API detail, and troubleshooting.
- `references/` contains only `api.md`.
- Helper scripts still claim Node.js `>=18`, while upstream `package.json` requires Node.js `>=22`.

## Mutable Artifact
Primary file: `.agent-skills/react-grab/SKILL.md`

Supporting files may be edited only as needed to keep the main skill truthful and usable:
- `.agent-skills/react-grab/references/*`
- `.agent-skills/react-grab/scripts/*`
- `.agent-skills/react-grab/evals/evals.json`
- wiki / graph / survey artifacts for durable memory

## Fixed Evaluation Harness
- Agent Skills validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/react-grab`
- Catalog sync: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- File-length check: `SKILL.md` should be materially smaller than 494 lines and remain under 500.
- Truthfulness check against upstream raw sources:
  - `https://raw.githubusercontent.com/aidenybai/react-grab/main/README.md`
  - `https://raw.githubusercontent.com/aidenybai/react-grab/main/package.json`
- Dry-run quality target: evals should still cover install, clipboard workflow, MCP, and plugin/API use, with at least one assertion protecting the Node/runtime requirement.

## Constraints
- Max scope: one skill lane only (`react-grab`).
- No new skill creation.
- Prefer one coherent structural improvement set over multiple unrelated tweaks.
- Update top-level docs only if the positioning/discovery surface materially changes.
- Keep claims source-backed.

## Tried Already
- Keep: survey-driven candidate selection across required domain lanes; choose the web/frontend lane because it had the clearest stale + overgrown anchor.
- Pending hypothesis: splitting the front-door skill and syncing scripts/evals will improve clarity and transfer without creating duplicate trigger noise.
