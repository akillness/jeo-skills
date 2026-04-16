# Loop Charter

## Goal
Improve the canonical `design-system` skill so it activates as a clearer frontend UI-system anchor, routes neighboring work out earlier, and leaves a smaller reusable packet instead of a long mixed manual.

## Current Baseline
- Primary mutable artifact: `.agent-skills/design-system/SKILL.md` is 459 lines.
- Support coverage exists but is shallow: only `references/scope-boundaries.md` plus basic evals/compact surfaces.
- Discovery surfaces already position `design-system` as canonical, but the skill body and compact wording still skew toward generic example generation.

## Mutable Artifact
Exactly one primary file: `.agent-skills/design-system/SKILL.md`

Supporting files may change only to keep the primary artifact coherent:
- `.agent-skills/design-system/references/*.md`
- `.agent-skills/design-system/evals/evals.json`
- `.agent-skills/design-system/SKILL.toon`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- survey/wiki/graph artifacts that record the run

## Fixed Evaluation Harness
- Agent Skills validation: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/design-system`
- Catalog sync: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Structural checks:
  - `design-system/SKILL.md` should shrink materially and stay comfortably under the 500-line guidance
  - stale `image-generation` residue should be removed
  - the main file should classify request mode, state route-outs early, and point to focused references
- Dry-run prompts:
  1. shared tokens + landing page + dashboard consistency
  2. multi-product breakpoint/token governance question
  3. reusable component API question that should route to `ui-component-patterns`
  4. accessibility-heavy remediation question that should route to `web-accessibility`

## Constraints
- Keep this run bounded to one existing skill, not a new skill.
- Prefer transferable structure improvements over one-off examples.
- Do not reopen canonical-vs-alias policy.
- Update docs only where positioning/discoverability meaningfully changes.
- Refresh wiki/graph only if the run lands meaningful structural changes.

## Tried Already
- Keep: prior canonicalization of `design-system` vs `frontend-design-system`
- Keep: repo-wide support-coverage completion and compact-surface sync work
- Revert/avoid: adding another frontend wrapper, leaving the canonical anchor as a giant mixed manual, or relying on alias-side docs to explain canonical boundaries
- Why: the graph and wiki both show the next value is dense-anchor hardening, not more skill proliferation
