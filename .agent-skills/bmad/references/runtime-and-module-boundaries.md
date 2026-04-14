# Runtime and Module Boundaries

The `bmad` skill should stay vendor-neutral at the core. Runtime overlays and specialist modules add depth around it.

## Runtime overlays
| Need | Use this |
|------|----------|
| Claude-first orchestration, hooks, team runtime, stop callbacks | `omc` |
| Codex-first workflow skills, AGENTS injection, tmux team runtime | `omx` |
| Gemini / Antigravity portable harness with `.agents/` source of truth | `ohmg` |

Rule: let `bmad` choose the next phase artifact, then route runtime-specific execution/setup to the matching overlay.

## Adjacent specialist skills
| Need | Use this |
|------|----------|
| Artifact approval / human review gate | `plannotator` |
| Execution-ready decomposition after the phase decision | `task-planning` |
| Game-production packet routing | `bmad-gds` |
| Open-ended ideation before project framing | `bmad-idea` |

## Specialist module depth
Upstream BMAD also favors a core-plus-modules shape:
- **TEA** — testing, NFR, automation, release-gate depth
- **Game Dev Studio** — game workflow specialization
- **Builder** — creating custom BMAD-compatible modules and skills
- **Creative modules** — fuzzy-front-end ideation and structured creativity

## Why this separation matters
A core BMAD entrypoint stays maintainable when it owns:
- project level
- current phase
- next artifact
- route-outs

It becomes noisy when it also tries to own:
- vendor runtime setup
- review UI setup
- testing/release-gate playbooks
- domain-specific production flows
- every command surface from every module
