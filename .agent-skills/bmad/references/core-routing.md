# Core Routing Model

Use `bmad` as the **common-layer BMAD/BMM router**.

## Canonical job
1. Determine the **primary intake packet** the user actually has now
2. Determine project level (`0`–`4`)
3. Determine current phase (`analysis`, `planning`, `solutioning`, `implementation`, `mixed`, or `unknown`)
4. Choose the **single next artifact or gate**
5. Route detailed follow-up to the correct adjacent skill or module

## Phase ladder
| Phase | Main question | Typical artifact |
|------|---------------|------------------|
| Analysis | What problem/opportunity are we solving? | product brief |
| Planning | What should be built and why? | PRD or tech spec |
| Solutioning | How should the system be shaped? | architecture |
| Implementation | How do we execute safely? | sprint plan / story packet / workflow status |

## Level guidance
- **Level 0** — minimal paperwork; bug fix or tiny change
- **Level 1** — light planning, small feature
- **Level 2** — clear PRD + architecture + execution packet
- **Level 3** — strong cross-system planning and multi-sprint coordination
- **Level 4** — enterprise-scale overhaul with strict gates

## Preferred outputs
Good `bmad` outputs are short and decisive:
- current phase
- next artifact
- why it is next
- route-outs
- what not to do yet

## Anti-patterns
Avoid turning `bmad` into:
- a giant command encyclopedia
- a runtime-specific setup guide
- a replacement for `task-planning`
- a replacement for `plannotator`
- a game-production orchestrator (`bmad-gds` owns that lane)
- a testing or release-gate specialist (route to TEA references or adjacent skills)
