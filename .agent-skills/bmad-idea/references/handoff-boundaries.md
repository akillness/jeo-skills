# bmad-idea Handoff Boundaries

`bmad-idea` owns **pre-planning framing**.
It should stop once the concept packet is clear enough for a later-stage skill to do its job.

## Neighboring skills

### `bmad`
Route to `bmad` when the idea is framed enough that the next question is:
- what BMAD phase are we in,
- what artifact comes next,
- whether we need a product brief, PRD, tech spec, architecture, or sprint plan.

What to pass forward:
- chosen concept / positioning / problem brief
- main assumptions and constraints
- project type and risk notes

### `task-planning`
Route to `task-planning` when the concept is approved and the next job is execution slicing.

What to pass forward:
- concept summary
- scope boundaries
- acceptance questions
- milestone or first-version constraint

### `marketing-automation`
Route to `marketing-automation` when the concept is clear and the next job is launch, growth, onboarding, funnel, or messaging execution.

What to pass forward:
- audience and value framing
- story / pitch packet
- proof points and unresolved message risks
- intended KPI or success condition

### `bmad-gds`
Route to `bmad-gds` when a game concept is strong enough to turn into production coordination.

What to pass forward:
- player fantasy
- pillars
- core loop
- target platform / audience
- first milestone or first-playable questions

## Routing rules
- If the user still says "we are not sure what the problem is" → stay in `bmad-idea`
- If the user says "we know what this is, now what do we write next?" → `bmad`
- If the user says "break this into work" → `task-planning`
- If the user says "take this to market" → `marketing-automation`
- If the user says "turn this game concept into a production plan" → `bmad-gds`

## Boundary anti-patterns
- Do not let `bmad-idea` become a giant prompt catalog again.
- Do not absorb roadmap, sprint, or campaign execution detail into the ideation step.
- Do not treat generic copy polishing as concept routing.
- Do not send a route-out without describing what packet should be handed forward.
