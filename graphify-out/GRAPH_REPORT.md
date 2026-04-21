# GRAPH_REPORT
## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, discovery indexing, and explicit cross-skill mentions
- Total skills: 90
- Manifest skills in `.agent-skills/skills.json`: 90
- Skills with references/: 90
- Skills with evals/: 90
- Skills with scripts/: 25
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 90
- Skills missing compact variants: 0
- Graph nodes: 390
- Graph edges: 1136

## Strongest structural findings
1. Discovery docs still dominate the graph because README / setup / manifest surfaces index nearly the full live catalog, so documentation sync remains mandatory whenever a skill boundary changes materially.
2. Support coverage remains effectively complete across the live skill set, so the best maintenance wins are still bounded front-door ratchets rather than new wrapper skills.
3. `bmad` is now a clearer packet-first BMAD front door: it starts from the packet already in hand (concept, planning, architecture, review, execution, runtime handoff, or brownfield resume) and routes ideation, review, runtime, execution slicing, and game-production depth outward sooner.
4. This run also removed a live installer-path residue point by updating `jeo/scripts/install.sh` to look for `.agent-skills/bmad/SKILL.md` instead of the stale `bmad-orchestrator` path.
5. The next best maintenance wins still look like oversized routers whose contracts are stable enough to shrink without changing ownership.

## Highest-degree nodes
- .agent-skills/skills.json: degree 90
- README.md: degree 89
- README.ko.md: degree 89
- setup-all-skills-prompt.md: degree 89
- .agent-skills/skills.toon: degree 82
- debugging: degree 37
- task-planning: degree 31
- jeo: degree 26

## Oversized front-door watchlist
- opencontext: 327 lines in SKILL.md
- testing-strategies: 312 lines in SKILL.md
- jeo: 305 lines in SKILL.md
- steam-store-launch-ops: 305 lines in SKILL.md
- task-planning: 288 lines in SKILL.md
- autoresearch: 285 lines in SKILL.md
- skill-autoresearch: 274 lines in SKILL.md
- fabric: 266 lines in SKILL.md
- omc: 265 lines in SKILL.md
- scrapling: 265 lines in SKILL.md

## Duplicate / consolidation notes
- Discovery docs remain the highest-degree maintenance nodes, so README/setup/manifest sync is still required whenever a skill boundary or trigger surface changes materially.
- `bmad` now fits the same packet-first maintenance pattern as neighboring front-door skills: start from the evidence packet in hand, choose one next artifact or gate, and route runtime/review/detail outward.
- Legacy `bmad-orchestrator` naming residue can hide live behavior; this run removed one live installer path bug in `jeo/scripts/install.sh`, but some secondary docs still reference the old name and should be cleaned in a later bounded pass.

## Recommended maintenance direction
- Keep targeting high-degree or oversized front-door skills whose contracts are stable enough to validate mechanically.
- Prefer packet/route-out clarifications and synced discovery surfaces over creating adjacent wrappers.
- Finish remaining legacy naming cleanup around historical `bmad-orchestrator` docs in a separate bounded pass instead of mixing a broad docs migration into every BMAD ratchet.
