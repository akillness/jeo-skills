# Loop Charter

## Goal
Improve the `opencontext` skill so it triggers reliably for project/repo memory and cross-agent handoff work, while clearly routing wiki-style and graph-style requests to the right adjacent skills.

## Current Baseline
- Existing `opencontext/SKILL.md` validates with 0 errors but 4 warnings (missing `## Instructions`, `## Examples`, `## Best practices`; description lacks imperative phrasing).
- The skill has no `references/` or `evals/` support files.
- Discovery copy in README / README.ko / setup / catalog surfaces is generic and underspecified.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/opencontext/SKILL.md`

Supporting artifacts allowed only if they reinforce the same fixed goal:
- `.agent-skills/opencontext/SKILL.toon`
- `.agent-skills/opencontext/references/*`
- `.agent-skills/opencontext/evals/evals.json`
- discovery/catalog surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- survey/wiki/graph artifacts that document the decision

## Fixed Evaluation Harness
- Agent Skills validator: `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/opencontext`
- JSON validity check for `.agent-skills/opencontext/evals/evals.json`
- Catalog sync check: `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- Dry-run rubric:
  - description clearly says when to use the skill
  - instructions are decision-first, not just a command list
  - route-outs to `llm-wiki`, graph memory, and human-authored vaults are explicit
  - support files materially improve reuse

## Constraints
- Keep the run bounded to one coherent improvement set around `opencontext`
- Prefer upgrading the existing skill over adding a new memory skill
- Keep claims source-backed with survey artifacts
- Update discovery surfaces if positioning changes materially
- Refresh graph outputs only if the structural/support snapshot changes meaningfully

## Tried Already
- Keep: none yet for this skill
- Revert: none yet for this skill
- Why: first dedicated modernization pass for `opencontext`
