# Loop Charter

## Goal
Improve the existing `code-review` skill so it routes review requests more compactly and truthfully without creating a new overlapping review wrapper.

## Current Baseline
- Baseline artifact: `.agent-skills/code-review/SKILL.md`
- Current shape: 287-line front door with good boundaries but still-dense repeated review-mode and output-shape detail.
- Current discovery surfaces: `SKILL.md`, `SKILL.toon`, `.agent-skills/skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/code-review/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills structure and description quality rules from `skill-standardization`
- Existing repo pattern for structural hardening: smaller routing-first front door + focused `references/` packet + synced compact/discovery surfaces
- Validation prompts in `.agent-skills/code-review/evals/evals.json`
- Catalog sync validation via `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`

## Constraints
- Keep this run bounded to the existing `code-review` skill and its directly derived surfaces.
- Do not add a new overlapping review skill.
- Preserve boundaries with `git-workflow`, `debugging`, `testing-strategies`, `performance-optimization`, and visual-review skills.
- Update README.md / README.ko.md / setup prompt if the trigger wording materially changes.

## Tried Already
- Keep: modernizing `code-review` into a workflow-aware review anchor.
- New hypothesis for this run: shrink the front door further around intake packets, severity handling, and route-outs while moving reusable packet detail into a support reference.
