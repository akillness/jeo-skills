# Context: bmad modernization

## Workflow Context
`bmad` should be the repository's **core BMAD/BMM orchestration lane**, but the current SKILL behaves like a mixed install guide, command list, review-gate how-to, TEA appendix, SSD appendix, and Fabric example dump. The more modern pattern in this repo is: normalize the intake, choose one mode, produce one next artifact, then route specialist work outward.

Primary evidence:
- Local target: `.agent-skills/bmad/SKILL.md`, `.agent-skills/bmad/REFERENCE.md`, `docs/bmad/README.md`
- Upstream BMAD: <https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md>
- Adjacent repo anchors: `.agent-skills/task-planning/SKILL.md`, `.agent-skills/plannotator/SKILL.md`, `.agent-skills/bmad-gds/SKILL.md`, `.agent-skills/ohmg/SKILL.md`, `.agent-skills/omx/SKILL.md`

A stronger `bmad` entrypoint should do four things:
1. identify project level / scale,
2. identify the current BMAD phase and artifact status,
3. recommend the next required or optional artifact,
4. route review, runtime-specific orchestration, and domain-specific follow-up to narrower skills or references.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| New BMAD adopter | Needs a safe entrypoint for phased work and the next artifact to create | Beginner–Intermediate |
| Cross-platform agent user | Needs BMAD guidance that survives Claude / Codex / Gemini differences | Intermediate |
| Maintainer | Needs lower-drift core docs and fewer duplicated responsibilities inside one skill | Advanced |
| Existing repo user | Needs repo discovery/setup surfaces to match the real `bmad` role | Intermediate |

## Current Workarounds
1. Use `omx` / `ohmg` for Codex- and Gemini-side orchestration details instead of relying on `bmad` alone.
2. Use `plannotator` as the actual phase-review / approval gate once a PRD, architecture doc, or similar artifact exists.
3. Use `task-planning` after the BMAD phase decision when the next job is execution-ready decomposition.
4. Use `bmad-gds` for game-production packets instead of stretching the core skill into game-specific production routing.
5. Fall back to helper scripts (`scripts/init-project.sh`, `scripts/check-status.sh`, `scripts/phase-gate-review.sh`) and status files rather than memorizing the whole SKILL body.

## Adjacent Problems
- Legacy naming drift (`bmad-orchestrator` still appears in docs and setup surfaces).
- Wrong or stale install/source framing inside the current SKILL (`supercent-io/skills-template`, `source: user-installed skill`).
- Too much platform leakage inside the core skill: Claude-first notes, OpenCode/Codex bridges, review tooling, and specialist module content are mixed together.
- Support coverage is non-standard: the folder has scripts/resources, but not a clean `references/` + `evals/` package aligned with the current maintenance loop.
- Discovery docs matter because `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` are high-degree nodes in the structural graph.

## User Voices
> “Ask `bmad-help` — it tells you exactly what's next and what's optional.”  
Source: upstream BMAD README, direct primary-page retrieval from <https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md>

> “Portable multi-agent harness with `.agents/` as the source of truth … later route work to Claude or Codex.”  
Source: local `ohmg` positioning in `.agent-skills/ohmg/SKILL.md`, reflecting the repo's current portability pattern.

> BMAD issue reporters want stricter review-state handling before auto-advancing phases, not looser command catalogs.  
Source: indexed GitHub issue evidence from <https://github.com/bmad-code-org/BMAD-METHOD/issues/2259>

## Sources
- Local repo evidence
  - `.agent-skills/bmad/SKILL.md`
  - `.agent-skills/bmad/REFERENCE.md`
  - `.agent-skills/bmad/scripts/*`
  - `.agent-skills/task-planning/SKILL.md`
  - `.agent-skills/plannotator/SKILL.md`
  - `.agent-skills/bmad-gds/SKILL.md`
  - `.agent-skills/ohmg/SKILL.md`
  - `.agent-skills/omx/SKILL.md`
  - `README.md`
  - `README.ko.md`
  - `setup-all-skills-prompt.md`
  - `graphify-out/GRAPH_REPORT.md`
- Primary-source web evidence
  - `https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md`
  - `https://github.com/bmad-code-org/BMAD-METHOD/issues/2259`
  - `https://raw.githubusercontent.com/bmad-code-org/bmad-builder/main/README.md`
  - `https://raw.githubusercontent.com/bmad-code-org/bmad-method-test-architecture-enterprise/main/README.md`
  - `https://raw.githubusercontent.com/bmad-code-org/bmad-module-game-dev-studio/main/README.md`

## Notes on evidence recovery
`web_search` and `web_extract` returned `401 Invalid API key` in this environment, so the survey used direct primary-page retrieval via terminal with a browser-like User-Agent and local repo inspection.