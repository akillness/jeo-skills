---
name: bmad-gds
description: ">"
compatibility: ">"
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: bmad, gds, game-development, game-production, gdd, milestone-planning, playtesting, launch-ops, orchestration
  platforms: Claude, Gemini, Codex, OpenCode
  keyword: bmad-gds
  version: 1.0.0
  source: akillness/jeo-skills
---






# BMAD Game Development Studio

Use this skill as the **game producer / orchestration layer** for the repository's game-development cluster.

The job is not to do every game task directly. The job is to:
1. normalize a messy game-production packet,
2. decide which phase or risk matters most now,
3. produce the next coordination artifact,
4. route specialist work to the right downstream skill.

Read [references/operating-modes.md](references/operating-modes.md) for the main entry modes and [references/scope-boundaries.md](references/scope-boundaries.md) before choosing between this skill and the narrower game skills.

## When to use this skill
- A game idea, prototype, or existing project needs to be turned into a milestone brief or production plan
- A small team needs help converting a GDD or design brief into epics, stories, and review checkpoints
- Playtest notes, bug lists, and milestone pressure need one cross-functional reprioritization pass
- A public beat such as a demo, festival, playtest, or launch target is forcing design, QA, and production decisions to reconnect
- The user needs one coordinating artifact first, then wants the skill to point toward the correct specialist follow-up

## When not to use this skill
- The main issue is a raw Unity or Unreal build/log failure with no broader planning decision → use `game-build-log-triage`
- The main issue is performance capture and bottleneck diagnosis → use `game-performance-profiler`
- The main issue is triaging player/demo feedback into weighted priorities → use `game-demo-feedback-triage`
- The main issue is store-page, wishlist funnel, or launch-page operations → use `steam-store-launch-ops`
- The user only needs a generic engineering sprint plan with no game-specific context → use `task-planning`
- The user only needs early ideation / creative expansion before a production framing exists → use `bmad-idea`

## Instructions

### Step 1: Capture the production intake brief
Before proposing a workflow, normalize the packet into this brief:

```yaml
project_brief:
  game_type: "genre, camera, platform, target audience"
  team_shape: solo | duo | small-team | unknown
  engine: Unity | Unreal | Godot | custom | unknown
  current_stage: concept | prototype | vertical-slice | demo | production | launch-prep | live-ops
  next_public_beat: none | internal-playtest | steam-playtest | next-fest | demo-drop | launch | patch
  source_packet:
    - idea-notes
    - gdd-or-design-doc
    - backlog-or-board
    - playtest-feedback
    - bug-or-build-issues
    - launch-or-store-constraints
  main_constraint: time | scope | quality | performance | unknown
  main_question: "what decision or artifact is needed next?"
```

If the packet is incomplete, still proceed with the best visible stage and state the assumptions.

### Step 2: Choose one operating mode
Pick exactly one primary mode for the current run.

1. **Concept → milestone brief**
   - Use when the team has an idea, prototype, or vague direction
   - Goal: define pillars, scope guardrails, first milestone, and risks

2. **GDD → backlog slice**
   - Use when design intent exists but implementation slices are weak
   - Goal: convert the GDD into epics, stories, acceptance checks, and review gates

3. **Mixed signals → reprioritization**
   - Use when playtest notes, bug reports, and milestone pressure are colliding
   - Goal: decide what must happen before the next build or public beat

4. **Build trouble → routing decision**
   - Use when a build issue is present but the real question is whether it blocks a milestone
   - Goal: produce the milestone/risk framing, then hand detailed log work to `game-build-log-triage`

5. **Public beat → readiness plan**
   - Use when the team is targeting a demo, festival, playtest, or launch window
   - Goal: connect design, QA, build stability, and store/demo readiness into one plan

### Step 3: Decide the next artifact, not the whole universe
Return **one primary artifact** from this list:
- `milestone-brief`
- `gdd-to-backlog packet`
- `reprioritization brief`
- `specialist-routing brief`
- `public-beat readiness plan`

Do not flood the team with parallel plans. Choose the single artifact that most reduces ambiguity right now.

### Step 4: Route specialist work explicitly
If the intake shows a narrower downstream problem, route out with a short reason:
- `game-demo-feedback-triage` → clustered player/demo feedback and fix-first recommendations
- `game-build-log-triage` → build, packaging, CI, signing, cook, compile, or editor-log failures
- `game-performance-profiler` → frame-time, memory, hitches, GPU/CPU bottleneck, Steam Deck or console perf complaints
- `steam-store-launch-ops` → store-page, wishlist funnel, launch sequencing, public-facing launch prep
- `task-planning` → general engineering decomposition after the game-specific milestone decision is made

If you route out, still leave the team with a short milestone-aware handoff, not just a tool name.

### Step 5: Produce the coordination artifact
Use this exact structure:

```markdown
# Game Production Coordination Brief

## Scope
- Game / build stage: ...
- Engine / platform context: ...
- Team shape: ...
- Next public beat: ...
- Confidence: high | medium | low

## Primary mode
- concept-to-milestone | gdd-to-backlog | reprioritization | build-trouble-routing | public-beat-readiness

## What matters most now
- 2-4 bullets on the strongest production truths from the packet

## Recommended next artifact
- One of: milestone-brief | gdd-to-backlog packet | reprioritization brief | specialist-routing brief | public-beat readiness plan

## Priority decisions
| Decision | Why now | Owner | Risk if delayed |
|----------|---------|-------|-----------------|
| ... | ... | ... | ... |

## Immediate next steps
1. ...
2. ...
3. ...

## Specialist handoffs
- Skill: ...
- Why: ...
- What packet to pass: ...

## What not to do yet
- 1-3 bullets preventing scope drift or the wrong lane
```

### Step 6: Keep the milestone thread visible
Every output must connect work back to the next meaningful beat:
- internal playtest
- Steam Playtest
- Next Fest / public demo
- launch target
- major patch or content drop

If there is no explicit beat, infer the next milestone from the packet and say so.

## Output format
Always return a **short producer-style coordination brief**.

Required qualities:
- prefer concrete next artifacts over abstract game-design essays
- surface the main constraint and tradeoff clearly
- keep specialist routing explicit
- preserve cross-functional visibility across design, engineering, QA, and launch timing
- keep the result under roughly 450-700 words unless the user asks for a larger planning packet

## Examples

### Example 1: concept to Steam demo
**Input**
> We are a 3-person Unity team building a co-op survival game. We have rough mechanic notes and a prototype, and we want a Steam demo in 8 weeks. Use bmad-gds.

**Output sketch**
- Primary mode: `concept-to-milestone`
- Recommended next artifact: `milestone-brief`
- Priority decisions cover demo fantasy, scope cuts, one playable loop, and test cadence
- Specialist handoff may point to `task-planning` only after the milestone brief is locked

### Example 2: mixed playtest plus bugs
**Input**
> We have Discord feedback, a bug sheet, and a Next Fest date. Players are confused early, and the latest build also has two packaging issues.

**Output sketch**
- Primary mode: `reprioritization`
- Recommended next artifact: `reprioritization brief`
- `game-demo-feedback-triage` gets the feedback packet
- `game-build-log-triage` gets the packaging failures
- The coordination brief keeps both tied to the Next Fest milestone

### Example 3: raw build problem only
**Input**
> Our Unreal CI build is failing during packaging. Help.

**Output sketch**
- Do not stay in `bmad-gds` as the main skill
- Return a short `specialist-routing brief`
- Route to `game-build-log-triage` with the exact log/build packet required

## Best practices
1. **Act like a producer, not a fantasy studio simulator** — convert ambiguity into one useful next artifact.
2. **Use one primary mode per run** — mixing concepting, launch ops, playtest triage, and log debugging weakens output quality.
3. **Route aggressively to specialist skills** when the packet is mostly feedback, logs, performance, or launch-page operations.
4. **Keep scope pressure explicit** — small game teams fail more often from spread than from under-ideation.
5. **Preserve milestone context** — build issues and design changes matter differently depending on whether the next beat is a demo, festival, or launch.
6. **Prefer re-entry workflows** — playtests and build failures often push teams back into planning; treat that as normal.

## References
- [references/operating-modes.md](references/operating-modes.md)
- [references/scope-boundaries.md](references/scope-boundaries.md)
- `../bmad-idea/SKILL.md`
- `../task-planning/SKILL.md`
- `../game-demo-feedback-triage/SKILL.md`
- `../game-build-log-triage/SKILL.md`
- `../game-performance-profiler/SKILL.md`
- `../steam-store-launch-ops/SKILL.md`
