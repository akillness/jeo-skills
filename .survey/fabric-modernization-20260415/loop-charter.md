# Loop Charter

## Goal
Improve the `fabric` skill so it becomes a clear, reusable, pattern-first CLI orchestration skill with better trigger precision, sharper boundaries, and the same support-file standard as other recently modernized skills.

## Current Baseline
Current `fabric/SKILL.md` is usable but broad: it reads like a general product overview + command catalog, lacks support files and evals, and does not clearly separate Fabric from generic AI CLIs, coding assistants, or upstream ingestion helpers.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/fabric/SKILL.md`

Supporting artifacts allowed only if the primary skill improves:
- `.agent-skills/fabric/references/*`
- `.agent-skills/fabric/evals/evals.json`
- `.agent-skills/fabric/SKILL.toon`
- repo discovery/docs surfaces that materially describe the skill
- survey/wiki/graph outputs for durable run memory

## Fixed Evaluation Harness
- Agent Skills spec and repo `validate_skill.sh`
- Catalog sync check: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Trigger-quality rubric:
  - clearly says when to use Fabric
  - clearly says when not to use Fabric
  - emphasizes pattern-first stdin/file/text workflows instead of generic AI chat
  - differentiates Fabric from coding assistants and upstream ingest helpers
- Dry-run prompts:
  1. "Pipe this transcript through Fabric and extract action items."
  2. "We need a reusable custom pattern pack for summarizing competitor articles."
  3. "Help me decide whether to use Fabric, a general LLM CLI, or a coding assistant for this job."

## Constraints
- Keep the run bounded to one skill modernization.
- Do not add a new overlapping utility skill.
- Keep the skill under 500 lines.
- Prefer references/evals over bloating the main SKILL.md.
- Update README.md / README.ko.md / setup-all-skills-prompt.md if positioning/discoverability materially changes.

## Tried Already
- Keep: direct survey of Fabric workflow/context/solution landscape using upstream repo + GitHub issues.
- Revert: none yet this run.
- Why: need evidence-backed boundary sharpening before editing the skill.
