# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, discovery indexing, and support-file links
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 25
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 386
- Graph edges: 1061

## Strongest structural findings
1. Discovery docs remain the highest-degree maintenance nodes because README / setup / manifest surfaces still index nearly the whole live catalog.
2. Support coverage remains effectively complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill.
3. `npm-git-install` now follows the routing-first developer-workflow pattern: start from the delivery packet already in hand, pick one package-delivery mode, and keep Git history, package-host admin, repo automation, and environment setup as explicit route-outs.
4. The next best maintenance wins still look like high-degree or oversized routers whose contracts are stable enough to tighten without adding overlapping skills.

## Highest-degree nodes
- skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- skills.toon: degree 82

## Oversized front-door watchlist
- clawteam: 329 lines in SKILL.md
- scrapling: 319 lines in SKILL.md
- task-planning: 294 lines in SKILL.md
- jeo: 288 lines in SKILL.md
- obsidian-cli: 286 lines in SKILL.md
- autoresearch: 284 lines in SKILL.md
- testing-strategies: 274 lines in SKILL.md
- omc: 272 lines in SKILL.md
- state-management: 272 lines in SKILL.md
- steam-store-launch-ops: 272 lines in SKILL.md

## Duplicate / consolidation notes
- The developer-workflow lane still benefits more from sharper routing boundaries than from adding new package-management wrappers.
- `npm-git-install` should stay distinct from `git-workflow`, `github-repo-management`, `workflow-automation`, and `system-environment-setup` by owning package-delivery choice rather than Git repair, package-host administration, repo glue, or machine setup.
- Duplicate pressure still rises more from oversized front doors than from missing support coverage; keep shrinking stable routers rather than expanding the catalog.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer support-packet improvements and synced discovery surfaces over creating adjacent wrappers.
- Re-run catalog/runtime sync validation whenever README/setup or discovery wording changes materially.
