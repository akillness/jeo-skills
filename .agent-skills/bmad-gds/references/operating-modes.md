# BMAD-GDS Operating Modes

Use `bmad-gds` when the team needs a **producer-style coordination artifact**, not when one specialist lane already dominates the packet.

## Mode 1: Concept → milestone brief
Best when the packet contains:
- pitch or idea notes
- rough prototype observations
- target platform / audience
- a near-term demo or milestone goal

Produce:
- design pillars
- scope guardrails
- first milestone definition
- top risks and cuts

## Mode 2: GDD → backlog slice
Best when the packet contains:
- GDD, design brief, or mechanic spec
- unclear ownership or sequencing
- a need to turn intent into epics/stories

Produce:
- epics
- story slices
- acceptance checks
- review cadence

Route to `task-planning` after the game-specific milestone framing is stable.

## Mode 3: Mixed signals → reprioritization
Best when the packet contains:
- playtest notes
- bug lists
- build concerns
- milestone pressure from a demo/festival/release

Produce:
- a short reprioritization brief
- one recommended next artifact
- specialist handoffs for the noisy parts

## Mode 4: Build trouble → routing decision
Best when the packet contains:
- build/log failures
- milestone impact uncertainty
- uncertainty about whether the issue is truly ship-blocking

Produce:
- short milestone-aware framing
- route details to `game-build-log-triage`

## Mode 5: Public beat → readiness plan
Best when the packet contains:
- Steam Playtest target
- Next Fest or public demo timing
- launch-window constraints
- store/demo readiness questions

Produce:
- readiness plan
- owner/risk table
- explicit follow-ups into `steam-store-launch-ops` or specialist gameplay/testing lanes
