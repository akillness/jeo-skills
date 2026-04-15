# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 82
- Skills with evals/: 83
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 372
- Graph edges: 1061

## Strongest structural findings
1. The graph remains docs-first: README.md, README.ko.md, setup-all-skills-prompt.md, skills.json, and skills.toon still touch every live skill and remain the highest-degree maintenance nodes.
2. `lmstudio-cli` is no longer a support-gap outlier: this run added `references/`, `evals/`, and a lightweight endpoint-check helper script, lifting the CLI / developer-workflow lane without creating another local-LLM wrapper.
3. The useful boundary for `lmstudio-cli` is now clearer: local `lms` control, remote endpoint verification, LM Studio-native management escalation, and downstream OpenAI-compatible wiring are separated instead of being collapsed into one command list.
4. Support coverage improved again through bounded modernization rather than catalog growth; the next leverage points remain the remaining no-reference or no-eval legacy skills, not duplicate additions.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- debugging: degree 41
- performance-optimization: degree 26
- bmad: degree 25
- code-review: degree 25
- task-planning: degree 24
- plannotator: degree 23
- vibe-kanban: degree 23

## Duplicate / consolidation notes
- `lmstudio-cli` now reads as an LM Studio operator skill instead of a generic local-model helper, which reduces pressure to add overlapping LM Studio/Ollama/OpenAI-endpoint wrapper skills.
- No new duplicate skill was introduced in the utilities / developer-workflow lane; this was a support-and-boundary ratchet on an existing skill.
- README/setup surfaces still do not name `lmstudio-cli` directly, so this run stayed scoped to the skill itself plus manifest alignment rather than widening into top-level onboarding copy.

## Recommended maintenance direction
- Keep using bounded modernization passes on remaining legacy skills with weak support coverage or vague trigger boundaries.
- Re-run catalog/runtime sync validation whenever a skill description or manifest entry changes materially.
- Treat local-model / endpoint skills as boundary-sensitive: preserve the split between platform-specific operations and downstream tool behavior.
