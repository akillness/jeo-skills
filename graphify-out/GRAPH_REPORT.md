# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 80
- Skills with evals/: 81
- Skills with scripts/: 23
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 81
- Skills missing compact variants: 8
- Graph nodes: 359
- Graph edges: 983

## Strongest structural findings
1. Discovery surfaces still behave like first-class routing nodes: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` point at the full catalog, so compact-variant drift is a real retrieval problem rather than a cosmetic one.
2. `game-performance-profiler` now has a compact discovery variant, which makes the game-performance lane consistent with its newly sharpened trigger surface around quick packets, benchmark routes, and device review.
3. `fabric` remains a high-degree utility anchor whose README-visible positioning matters; keeping its stronger boundary alongside refreshed graph outputs reduces the chance of another vague AI-CLI wrapper appearing nearby.
4. The remaining maintenance gap is narrow and legible: only 8 skills still lack compact variants (clawteam, game-build-log-triage, game-ci-cd-pipeline, game-demo-feedback-triage, lmstudio-cli, obsidian-plugin, research-paper-writing, steam-store-launch-ops).

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
- The game cluster is healthier when specialist lanes stay separate: build logs, CI/release structure, demo feedback, runtime performance, and Steam launch ops should not collapse into one catch-all skill.
- Compact variants should follow material trigger-surface rewrites; otherwise the runtime may advertise stale intent even when `SKILL.md` has already improved.
- The cleaner next move remains support/variant completion for the last missing skills, not adding another overlapping wrapper.

## Recommended maintenance direction
- Finish compact-variant coverage for the last missing skills or explicitly weaken the docs claim that every skill folder ships `SKILL.toon`.
- Keep validating catalog/runtime sync after any material skill rewrite.
- Use the wiki to record which remaining missing-variant skills were accepted or deferred so the loop compounds instead of rediscovering the same gaps.
