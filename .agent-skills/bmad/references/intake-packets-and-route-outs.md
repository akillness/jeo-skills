# Intake Packets and Route-Outs

Use this file when the request is messy and you need the quickest truthful front-door choice.

## Primary packet selector
Choose **one** packet first.

| Packet | Use when the user already has… | Default next move | Common route-outs |
|---|---|---|---|
| `concept-packet` | raw idea notes, problem framing, audience/value question, pre-PRD ambiguity | `product-brief` or route to `bmad-idea` | `bmad-idea` |
| `planning-packet` | product brief, rough requirements, PRD/tech-spec ambiguity | `prd` or `tech-spec` | `plannotator` after draft, `task-planning` after approval |
| `architecture-packet` | architecture draft, system-shape uncertainty, design tradeoffs | `architecture` or `architecture review gate` | `plannotator`, then `task-planning` |
| `review-gate-packet` | existing artifact plus review comments or approval blockage | `plannotator` review | `plannotator` |
| `execution-packet` | approved scope, sprint-plan need, story slicing, milestone prep | `sprint-plan` or `story packet` | `task-planning` |
| `runtime-handoff-packet` | approved plan, runtime setup, agent execution handoff | runtime handoff | `omc`, `omx`, `ohmg` |
| `brownfield-resume-packet` | live repo, issue URL, partial implementation, stale docs, unclear current state | `workflow-status` update, repo-state summary, then smallest missing artifact | `task-planning`, `plannotator`, runtime overlays |

## Brownfield rule
If the request starts from a real repo, issue, failing implementation, or stale artifacts, do **not** pretend it is a clean greenfield BMAD start.

Preferred move:
1. acknowledge the brownfield packet,
2. state the likely current phase as `mixed` or `unknown` if necessary,
3. recommend the smallest truthful next artifact or status update.

## Project-level guardrails
- **Level 0–1:** prefer lighter artifacts; often `tech-spec` or direct implementation slice after a quick review.
- **Level 2+:** usually needs stronger planning + architecture visibility.
- **Level 3–4:** treat approval and handoff discipline as first-class, not optional.

## Route-out rules
### Route to `bmad-idea`
Use when the packet is still about concept shaping, positioning, audience, or the core problem rather than execution planning.

### Route to `plannotator`
Use when the correct artifact already exists and the next real blocker is review/approval.

### Route to `task-planning`
Use when the next artifact is already clear and the remaining work is execution slicing, backlog cleanup, sprint prep, or milestone planning.

### Route to `omc`, `omx`, or `ohmg`
Use when the plan is ready and the real question is runtime-native execution, settings/rules/hooks, or agent orchestration behavior.

### Route to `bmad-gds`
Use when the packet is mostly game-specific: GDD, playtest synthesis, build issues, demo readiness, launch beats, or milestone pressure.

## Anti-patterns
- Do not recommend three parallel artifacts just to sound comprehensive.
- Do not bury a missing review gate under fresh document creation.
- Do not let runtime setup swallow the common BMAD layer.
- Do not treat a brownfield repo like a blank-sheet idea exercise.
