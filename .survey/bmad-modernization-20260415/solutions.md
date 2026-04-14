# Solution Landscape: bmad modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `bmad` as thin core orchestrator | Keep `bmad` focused on project level, phase state, next artifact, and route-outs | Portable, lower drift, clearer trigger surface | Needs good references for specialist depth | Best fit for this repo and upstream BMAD direction |
| BMAD core + official module ecosystem | Keep specialist depth in TEA / Game Dev Studio / Builder / Creative modules | Scales without bloating core | Requires explicit boundaries | Repeated upstream pattern |
| Runtime overlays (`omc`, `ohmg`, `omx`) | Let platform-first skills own Claude / Gemini / Codex execution surfaces | Clear settings/rules/hooks separation | Requires documentation discipline | Already the repo pattern |
| Review gate via `plannotator` | Keep approval/review handling outside the core BMAD entrypoint | Better human-in-the-loop clarity | Adds a handoff step | Works well for PRD / architecture / sprint-plan review |
| Downstream decomposition via `task-planning` | Route execution packet creation to a planning specialist | Keeps `bmad` from becoming backlog sprawl | Requires explicit route-outs | Strong local adjacency |
| Monolithic BMAD skill | Put core, modules, gating, runtime, and examples into one giant SKILL | One file to read | High drift, weak triggering, duplicate responsibilities | Current `bmad` is too close to this anti-pattern |

## Categories
- **Core workflow engine** — BMAD/BMM core, `bmad`
- **Specialist module ecosystem** — Builder, TEA, Game Dev Studio, Creative modules
- **Runtime overlays** — `jeo`, `omc`, `ohmg`, `omx`
- **Review / gate layers** — `plannotator`, TEA release/test gates
- **Execution-packet specialists** — `task-planning`, `bmad-gds`
- **Discovery/setup surfaces** — `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`

## What People Actually Use
In practice, users rely on install commands, generated workflow surfaces, helper scripts, status files, and “what next?” routing helpers more than long static skill bodies. Upstream BMAD emphasizes `npx bmad-method install` and `bmad-help`; this repo's local users already lean on `scripts/init-project.sh`, `scripts/check-status.sh`, `plannotator`, and runtime overlays when the task gets specific.

## Frequency Ranking
1. Thin core orchestrator + phased workflow docs
2. Core + specialist modules
3. Platform/runtime overlays above the core
4. Explicit review gates between artifacts and advancement
5. Downstream specialist packets instead of core-skill sprawl

## Key Gaps
- `bmad` still lacks modern trigger wording and standard support coverage (`references/`, `evals/`).
- The current main skill body duplicates responsibilities better owned by `plannotator`, `task-planning`, `ohmg`, `omx`, and module references.
- Discovery docs still describe `bmad` as a simpler phase catalog instead of a current portable router.
- Legacy naming (`bmad-orchestrator`) and source/install drift reduce trust.

## Contradictions
- **Marketed claim:** `bmad` is already the simplified core orchestrator.  
  **Current reality:** docs and SKILL content still behave like a mixed legacy bundle.
- **Marketed claim:** one skill can explain the whole BMAD lifecycle.  
  **Observed reality:** both upstream BMAD and this repo work better when the core routes to modules, runtime overlays, and approval surfaces.
- **Marketed claim:** command surfaces are the core UX.  
  **Observed reality:** actual usage centers on next-step guidance, artifacts, scripts, and generated runtime views.

## Key Insight
The strongest modernization path is not to add another BMAD-adjacent skill. It is to make `bmad` a **portable core phase router** that selects level, checks phase state, recommends the next artifact, and delegates runtime-specific execution, review gates, and specialist work to adjacent skills and references. That matches upstream BMAD's move toward help/installer-driven workflows and matches this repo's broader trend toward sharper, lower-drift anchors.

## Curated Sources
- Upstream core: <https://github.com/bmad-code-org/BMAD-METHOD>
- Upstream README: <https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md>
- Upstream Builder: <https://raw.githubusercontent.com/bmad-code-org/bmad-builder/main/README.md>
- Upstream TEA: <https://raw.githubusercontent.com/bmad-code-org/bmad-method-test-architecture-enterprise/main/README.md>
- Upstream Game Dev Studio: <https://raw.githubusercontent.com/bmad-code-org/bmad-module-game-dev-studio/main/README.md>
- Local target: `.agent-skills/bmad/SKILL.md`
- Local neighbors: `.agent-skills/plannotator/SKILL.md`, `.agent-skills/task-planning/SKILL.md`, `.agent-skills/ohmg/SKILL.md`, `.agent-skills/omx/SKILL.md`, `.agent-skills/bmad-gds/SKILL.md`
