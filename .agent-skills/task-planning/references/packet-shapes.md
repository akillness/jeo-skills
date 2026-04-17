# Packet Shapes

Use the smallest output shape that preserves readiness and boundaries.

## 1. Single packet
Best when one feature, bug cluster, or scoped initiative just needs a compact planning packet.

Include:
- mode + domain
- goal
- assumptions
- work-slice table
- 1-3 slice details
- sequencing
- blockers
- one next move

## 2. Slice table plus not-ready list
Best for backlog cleanup and triage-heavy work.

Include:
- ready slices table
- not-ready list with missing inputs
- dedupe / merge notes if needed
- recommendation: estimate, groom with owners, or run discovery first

## 3. Release packet
Best for launch windows, campaigns, rollouts, or time-sensitive deliveries.

Include:
- release trigger or deadline
- slices for creation, approval, distribution, verification, and reporting
- critical dependencies and freeze points
- launch-day or release-day checks

## 4. Milestone packet
Best for game milestones, demos, or cross-discipline delivery windows.

Include:
- milestone goal
- must-have vs stretch work
- code/system slices
- content/polish slices
- QA/playtest/build/distribution slices
- risk register and fallback scope

## Domain lenses

### Developer workflow
- repo or workflow boundary
- ownership between implementation, verification, docs, and release chores
- external tooling / access blockers

### Web / fullstack
- frontend, backend, data, analytics, QA, rollout, docs
- auth or migration implications
- user-flow checkpoints

### Product / operations
- approvals and decision checkpoints
- source-of-truth artifact updates
- reporting or enablement work
- handoffs between PM, ops, and delivery teams

### Marketing / GTM
- asset creation
- review / approval
- channel setup and distribution
- measurement / attribution / reporting
- launch window timing

### Game development
- systems/code
- content/art/UI/narrative/polish
- build/platform constraints
- QA/playtest/telemetry
- milestone/demo/readiness gates

## Output discipline
- Keep one packet small enough to act on immediately.
- If you need multiple packets, name why: separate release packet, milestone packet, or discovery packet.
- Do not fold estimation, board control, or review workflow into the packet unless the user explicitly wants those adjacent tasks too.
