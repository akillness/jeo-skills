# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 80
- Skills with evals/: 81
- Skills with scripts/: 23
- Graph nodes: 278
- Graph edges: 957

## Strongest structural findings
1. `fabric` now meets the support-file floor with both `references/` and `evals/`, which upgrades a README-visible utility anchor without adding another overlapping AI CLI wrapper.
2. The utilities lane remains healthier when `fabric` stays focused on reusable pattern-driven text transforms rather than blurring into coding-assistant work, generic chat CLIs, or upstream scraping.
3. Discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`) remain among the highest-degree nodes, so wording drift on visible utility skills materially affects activation.
4. The better maintenance move is still bounded modernization of weak anchors and aliases, not adding another prompt/pattern wrapper next to `fabric`.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 80
- debugging: degree 40
- bmad: degree 25
- code-review: degree 25
- performance-optimization: degree 24
- task-planning: degree 23
- plannotator: degree 22
- vibe-kanban: degree 22

## Duplicate / consolidation notes
- `fabric` should stay separate from generic coding assistants: repo-aware editing is a different job from reusable content/text transforms.
- `fabric` should stay separate from upstream content acquisition helpers: fetch/cleanup is adjacent work, not the core pattern layer.
- The utility lane does not justify another Fabric-adjacent wrapper right now; the cleaner move was to modernize the existing anchor and add support coverage.

## Recommended maintenance direction
- Keep upgrading README-visible legacy skills that still lack `references/` or `evals/` before adding new utility wrappers.
- Re-check utility-lane boundaries whenever a prompt/pattern or AI-CLI skill is materially repositioned.
- Keep discovery docs and shipped manifests aligned with trigger-surface rewrites.
