# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 80
- Skills with evals/: 81
- Skills with scripts/: 23
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 367
- Graph edges: 991

## Strongest structural findings
1. The compact-discovery layer is now complete again: every filesystem skill ships either `SKILL.toon` or `SKILL.compact.md`, so the repo docs and runtime assumptions are aligned.
2. The bounded sweep closed support drift without adding new overlapping skills, which is exactly the kind of maintenance ratchet the repo has been favoring across earlier modernization passes.
3. The game cluster is no longer an outlier in compact discovery coverage; all four remaining specialist gaps there were closed in the same pass.
4. The next highest-leverage work is no longer variant completion but true content modernization for the warning-heavy legacy skills that still lint with non-fatal spec gaps.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 89
- debugging: degree 25
- code-review: degree 24
- performance-optimization: degree 24
- task-planning: degree 24
- plannotator: degree 22
- system-environment-setup: degree 22
- vibe-kanban: degree 22

## Duplicate / consolidation notes
- Compact support completion removed a support-layer inconsistency; it did not create a new reason to split or merge skills.
- The game cluster remains healthier when build logs, CI/release structure, demo feedback, runtime performance, and Steam launch ops stay in separate skills.
- Future docs edits should keep describing compact variants as shipped artifacts only if the filesystem scan still says coverage is complete.

## Recommended maintenance direction
- Use future bounded runs on actual content modernization targets such as warning-heavy legacy skills rather than more support-layer cleanup for this specific gap.
- Keep validating catalog/runtime sync after any material skill rewrite.
- Re-run the structural scan whenever a skill is added or a compact variant is removed so the wiki and docs do not drift again.
